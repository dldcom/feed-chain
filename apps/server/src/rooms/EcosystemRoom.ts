import { Client, CloseCode, Room } from "@colyseus/core";
import {
  CANONICAL_FOOD_RELATIONS,
  EAT_COOLDOWN_MS,
  EAT_RANGE,
  GHOST_DURATION_MS,
  PHASE_LABELS,
  PLANT_SPAWN_POINTS,
  ROLE_DISTRIBUTION_23,
  SPECIES,
  SPAWN_POINTS,
  WRONG_FOOD_STUN_MS,
  MoveInput,
  applyMovement,
  canEat,
  clampToBounds,
  collidesWithObstacle,
  edgesFromKeys,
  isActivePlayPhase,
  isGameModeId,
  isPlayableSpeciesId,
  isSpeciesId,
  isWithinEatServerReach,
  modeConfig,
  isWebPhase,
  nextPhase,
  relationKey,
  roundedScore,
  scoreForRelation,
  simulateEcosystem,
  type BlueEdgeInput,
  type EatInput,
  type GamePhase,
  type GameModeConfig,
  type GameModeId,
  type ModeResult,
  type ModeTimelinePoint,
  type PlayableSpeciesId,
  type SpeciesDefinition,
  type SpeciesId,
  type TeacherCommand,
} from "@feed-chain/shared";
import { AnimalNpcState, GameState, IndividualRelationState, PlantState, PlayerState, PopulationState, RelationState } from "./schema.js";

interface RoomOptions {
  roomCode?: string;
  teacherToken?: string;
  nickname?: string;
  isTeacher?: boolean;
}

const ROUND_DURATION_MS = 5 * 60 * 1000;
const EXPERIMENT_DURATION_MS = 3 * 60 * 1000;
const PLANT_RESPAWN_MS = 12000;
// 먹이를 못 찾았을 때 약 111초 후 고갈된다. 1·2판에서는 고갈 시 감속만 적용한다.
const HUNGER_PER_SECOND = 0.9;
const CATERPILLAR_ESCAPE_MS = 1500;
const CATERPILLAR_ESCAPE_SPEED = 1.3;
const MODE_TIMELINE_INTERVAL_MS = 5000;

export class EcosystemRoom extends Room<{ state: GameState; input: MoveInput }> {
  maxClients = 24;
  inputs = this.defineInput(MoveInput, {
    bufferMaxSize: 64,
    sanitize: { x: [-1, 1], y: [-1, 1] },
    idle: ({ latest }) => latest ?? true,
  });
  private teacherToken = "";
  private teacherSessionId = "";
  private discoveredByPlayer = new Map<string, Set<string>>();
  private lastEatAt = new Map<string, number>();
  private disconnectedAt = new Map<string, number>();
  private experimentSeed = 20260830;
  private mealsSinceBirth = new Map<string, number>();
  private npcWander = new Map<string, { x: number; y: number; changeAt: number }>();
  private npcSequence = 0;
  private lifeStartedAt = new Map<string, number>();
  private currentMode: GameModeConfig | null = null;
  private modeTimeline: ModeTimelinePoint[] = [];
  private nextTimelineAt = 0;
  private completedModeResults: ModeResult[] = [];

  onCreate(options: RoomOptions): void {
    const requestedCode = (options.roomCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (requestedCode.length !== 6) throw new Error("수업 코드는 6자리여야 합니다.");

    this.roomId = requestedCode;
    this.teacherToken = options.teacherToken ?? "";
    this.state = new GameState();
    this.state.roomCode = requestedCode;
    this.state.expectedRelations = CANONICAL_FOOD_RELATIONS.length;
    this.state.modeId = "";
    this.state.modeNumber = 0;
    this.state.modeTitle = "";
    this.state.modeElapsedMs = 0;
    this.state.modeResultJson = "";
    this.patchRate = 50;
    this.seedPlants();

    this.onMessage("eat", (client, input: EatInput) => this.handleEat(client, input));
    this.onMessage("skill", (client) => this.handleSkill(client));
    this.onMessage("blue_edge", (client, input: BlueEdgeInput) => this.handleBlueEdge(client, input));
    this.onMessage("teacher", (client, command: TeacherCommand) => this.handleTeacherCommand(client, command));
    this.onMessage("download_result", (client) => this.sendResult(client));

    this.setFixedTimestep((ctx) => this.updateWorld(ctx.dt * 1000, ctx.dt), 30);
  }

  onJoin(client: Client, options: RoomOptions): void {
    if (options.isTeacher) {
      if (!this.teacherToken || options.teacherToken !== this.teacherToken) {
        client.leave(4001, "교사 인증 정보가 올바르지 않습니다.");
        return;
      }
      this.teacherSessionId = client.sessionId;
      client.send("teacher_ready", { roomCode: this.state.roomCode });
      return;
    }

    if (this.state.players.size >= 23) {
      client.leave(4002, "이 수업에는 이미 23명이 참여했습니다.");
      return;
    }

    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = this.cleanNickname(options.nickname ?? "생태 탐험가");
    player.species = ROLE_DISTRIBUTION_23[this.state.players.size % ROLE_DISTRIBUTION_23.length] ?? "grasshopper";
    if (this.currentMode?.playableSpecies.length) {
      player.species = this.currentMode.playableSpecies[this.state.players.size % this.currentMode.playableSpecies.length] ?? player.species;
    }
    const spawn = SPAWN_POINTS[this.state.players.size % SPAWN_POINTS.length] ?? SPAWN_POINTS[0];
    player.x = spawn.x;
    player.y = spawn.y;
    player.moveSpeed = isPlayableSpeciesId(player.species) ? SPECIES[player.species].baseSpeed : 0;
    player.populationCount = 1;
    player.lastFoodAt = 0;
    player.respawnAt = 0;
    if (this.currentMode && !this.currentMode.playableSpecies.includes(player.species as PlayableSpeciesId)) {
      player.status = "extinct";
      player.populationCount = 0;
    }
    this.state.players.set(client.sessionId, player);
    this.discoveredByPlayer.set(client.sessionId, new Set());
    if (player.status === "active") this.lifeStartedAt.set(client.sessionId, Date.now());
    else this.lifeStartedAt.delete(client.sessionId);
    this.refreshPopulationState();
    this.broadcast("notice", { kind: "info", text: `${player.name} 탐험가가 들어왔어요!` });
  }

  onDrop(client: Client, code?: number): void {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.connected = false;
      this.disconnectedAt.set(client.sessionId, Date.now());
    }
    if (code !== CloseCode.CONSENTED) this.allowReconnection(client, 30);
  }

  onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
    this.disconnectedAt.delete(client.sessionId);
    this.lifeStartedAt.delete(client.sessionId);
    if (!player && this.teacherSessionId === client.sessionId) this.teacherSessionId = client.sessionId;
  }

  onLeave(client: Client): void {
    if (client.sessionId === this.teacherSessionId) {
      this.teacherSessionId = "";
      return;
    }

    this.state.players.delete(client.sessionId);
    this.discoveredByPlayer.delete(client.sessionId);
    this.lastEatAt.delete(client.sessionId);
    this.disconnectedAt.delete(client.sessionId);
    this.refreshPopulationState();
  }

  private cleanNickname(value: string): string {
    const cleaned = value.replace(/[<>]/g, "").trim().slice(0, 12);
    return cleaned || "생태 탐험가";
  }

  private seedPlants(): void {
    PLANT_SPAWN_POINTS.forEach((point, index) => {
      const plant = new PlantState();
      plant.id = `plant-${index}`;
      plant.species = index % 4 === 0 ? "berry" : "grass";
      plant.x = point.x;
      plant.y = point.y;
      this.state.plants.set(plant.id, plant);
    });
  }

  private handleEat(client: Client, input: EatInput): void {
    if (!isActivePlayPhase(this.state.phase as GamePhase) || this.state.paused) return;
    const now = Date.now();
    const attacker = this.state.players.get(client.sessionId);
    if (!attacker || attacker.status !== "active" || attacker.wrongUntil > now) return;
    if ((this.lastEatAt.get(client.sessionId) ?? 0) + EAT_COOLDOWN_MS > now) return;

    const playerTarget = this.state.players.get(input.targetId);
    const plantTarget = this.state.plants.get(input.targetId);
    const animalTarget = this.state.animals.get(input.targetId);
    if (!playerTarget && !plantTarget && !animalTarget) return;

    const targetX = playerTarget?.x ?? plantTarget?.x ?? animalTarget?.x ?? 0;
    const targetY = playerTarget?.y ?? plantTarget?.y ?? animalTarget?.y ?? 0;
    const requestedFacing = Number.isFinite(input.facingX) && Number.isFinite(input.facingY)
      ? { x: Math.max(-1, Math.min(1, input.facingX)), y: Math.max(-1, Math.min(1, input.facingY)) }
      : undefined;
    if (!isWithinEatServerReach(attacker, { x: targetX, y: targetY }, requestedFacing)) return;
    if ((playerTarget && playerTarget.status !== "active") || (plantTarget && !plantTarget.active) || (animalTarget && (animalTarget.status !== "active" || animalTarget.extinct))) return;

    const preySpecies = playerTarget?.species ?? plantTarget?.species ?? animalTarget?.species ?? "";
    // 모드에서 빠진 종은 오래된 클라이언트 스냅샷으로 눌러도 행동으로 처리하지 않는다.
    // 이 검사를 쿨타임보다 앞에 두어 무효 입력이 먹기 기회를 소모하지 않게 한다.
    if (!this.isSpeciesActiveInMode(preySpecies)) return;

    // 실제로 판정 가능한 대상이 있을 때만 행동과 쿨타임을 소비한다.
    this.lastEatAt.set(client.sessionId, now);
    attacker.eatReadyAt = now + EAT_COOLDOWN_MS;

    attacker.eatAttempts += 1;
    if (!this.canEatInCurrentPhase(attacker.species, preySpecies)) {
      if (this.state.phase === "experiment_a" && canEat(attacker.species, preySpecies)) {
        client.send("notice", { kind: "info", text: "실험 A에서는 실제로 발견한 빨간 관계만 이용할 수 있어요." });
        return;
      }
      attacker.wrongUntil = now + WRONG_FOOD_STUN_MS;
      client.send("action_effect", { kind: "wrong", actorId: attacker.id, targetId: input.targetId });
      client.send("notice", { kind: "warning", text: "잘못 먹어서 배탈이 났어요!" });
      return;
    }

    if (playerTarget) {
      if (playerTarget.shielded || (playerTarget.stealth && Math.hypot(attacker.x - targetX, attacker.y - targetY) > 30)) {
        this.broadcast("action_effect", { kind: "blocked", actorId: attacker.id, targetId: playerTarget.id });
        client.send("notice", { kind: "info", text: playerTarget.shielded ? `${playerTarget.name}이(가) 몸을 단단히 말았어요!` : `${playerTarget.name}이(가) 잠복해서 놓쳤어요!` });
        return;
      }
      if (playerTarget.escapeUntil > now) {
        this.broadcast("action_effect", { kind: "blocked", actorId: attacker.id, targetId: playerTarget.id });
        client.send("notice", { kind: "info", text: `${playerTarget.name}이(가) 몸 말기에서 재빨리 벗어났어요!` });
        return;
      }
      this.consumePlayer(playerTarget, now);
      this.recordIndividualRelation(playerTarget, attacker);
    } else if (plantTarget) {
      this.consumePlant(plantTarget, now);
    } else if (animalTarget) {
      this.consumeAnimalNpc(animalTarget, now);
    }

    attacker.hunger = Math.min(100, attacker.hunger + 34);
    attacker.successfulEats += 1;
    this.increasePopulation(attacker);
    const key = relationKey(preySpecies, attacker.species);
    const discoveries = this.discoveredByPlayer.get(client.sessionId) ?? new Set<string>();
    const seenBefore = discoveries.has(key);
    discoveries.add(key);
    this.discoveredByPlayer.set(client.sessionId, discoveries);
    attacker.score = roundedScore(attacker.score + scoreForRelation(seenBefore));
    this.recordObservedRelation(preySpecies, attacker.species);
    if (this.state.phase === "experiment_a" && !this.currentMode) this.advancePlayerReproduction(attacker, now);
    this.broadcast("action_effect", { kind: "eat", actorId: attacker.id, targetId: input.targetId });
    this.broadcast("action_effect", { kind: "population", actorId: attacker.id, targetId: input.targetId, delta: 1, species: attacker.species as SpeciesId });
    this.refreshPopulationState();
    client.send("notice", {
      kind: "success",
      text: seenBefore ? "먹이 관계를 다시 확인했어요! +0.1" : "새로운 먹이 관계 발견! +2",
    });
  }

  private consumePlayer(target: PlayerState, now: number): void {
    this.recordLifeEnd(target, now);
    target.populationCount = Math.max(0, target.populationCount - 1);
    target.hunger = 100;
    target.shielded = false;
    target.stealth = false;
    if (this.state.phase === "experiment_a" && !this.currentMode) {
      target.status = "extinct";
      target.ghostUntil = 0;
      target.respawnAt = 0;
      this.broadcast("action_effect", { kind: "population", actorId: target.id, delta: -1, species: target.species as SpeciesId });
      return;
    }
    const mode = this.currentMode;
    if (target.populationCount > 0) {
      target.status = "respawning";
      target.respawnAt = now + (mode?.respawnDelayMs ?? 3000);
      target.ghostUntil = 0;
    } else {
      target.status = "ghost";
      target.respawnAt = 0;
      target.ghostUntil = now + (mode?.ghostDurationMs ?? GHOST_DURATION_MS);
    }
    this.broadcast("action_effect", { kind: "population", actorId: target.id, delta: -1, species: target.species as SpeciesId });
  }

  private consumePlant(target: PlantState, now: number): void {
    if (!target.active) return;
    target.active = false;
    target.respawnAt = now + (this.currentMode?.plantRespawnMs ?? PLANT_RESPAWN_MS);
    this.broadcast("action_effect", { kind: "population", actorId: target.id, delta: -1, species: target.species as SpeciesId });
  }

  private consumeAnimalNpc(target: AnimalNpcState, now: number): void {
    if (target.status !== "active" || target.extinct) return;
    target.populationCount = Math.max(0, target.populationCount - 1);
    target.lastFoodAt = 0;
    const mode = this.currentMode;
    if (target.populationCount > 0) {
      target.status = "respawning";
      target.respawnAt = now + (mode?.respawnDelayMs ?? 3000);
      target.ghostUntil = 0;
    } else if (target.fixed && mode?.npc.some((entry) => entry.species === target.species && !entry.respawnWhenExtinct)) {
      target.status = "extinct";
      target.extinct = true;
      target.respawnAt = 0;
      target.ghostUntil = 0;
    } else {
      target.status = "ghost";
      target.respawnAt = 0;
      target.ghostUntil = now + (mode?.ghostDurationMs ?? GHOST_DURATION_MS);
    }
    this.broadcast("action_effect", { kind: "population", actorId: target.id, delta: -1, species: target.species as SpeciesId });
  }

  private increasePopulation(entity: PlayerState | AnimalNpcState, now = Date.now()): void {
    // 모드 규칙상 먹이에 성공할 때마다 현재 개체수와 관계없이 정확히 1을 더한다.
    entity.populationCount = Math.max(0, entity.populationCount) + 1;
    entity.lastFoodAt = now;
  }

  private isSpeciesActiveInMode(species: string): boolean {
    if (!isSpeciesId(species)) return false;
    return !this.currentMode || this.currentMode.activeSpecies.includes(species);
  }

  private refreshPopulationState(): void {
    const ids = Object.keys(SPECIES) as SpeciesId[];
    ids.forEach((species) => {
      let state = this.state.populations.get(species);
      if (!state) {
        state = new PopulationState();
        state.species = species;
        this.state.populations.set(species, state);
      }
      const count = this.populationOf(species);
      state.count = count;
      state.peak = Math.max(state.peak, count);
    });
  }

  private recordLifeEnd(player: PlayerState, now: number, wasEaten = true): void {
    const startedAt = this.lifeStartedAt.get(player.id);
    if (startedAt !== undefined) player.survivalMs += Math.max(0, now - startedAt);
    player.livesEnded += 1;
    if (wasEaten) player.timesEaten += 1;
    this.lifeStartedAt.delete(player.id);
  }

  private recordObservedRelation(prey: string, predator: string): void {
    const key = relationKey(prey, predator);
    const existing = this.state.observedRelations.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    const relation = new RelationState();
    relation.prey = prey;
    relation.predator = predator;
    relation.count = 1;
    this.state.observedRelations.set(key, relation);
  }

  private canEatInCurrentPhase(predator: string, prey: string): boolean {
    if (!canEat(predator, prey)) return false;
    if (this.currentMode) {
      return this.currentMode.relations.some((edge) => edge.prey === prey && edge.predator === predator);
    }
    if (this.state.phase !== "experiment_a") return true;
    return this.state.observedRelations.has(relationKey(prey, predator));
  }

  private recordIndividualRelation(prey: PlayerState, predator: PlayerState): void {
    const key = `${prey.id}->${predator.id}`;
    const existing = this.state.individualRelations.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    const relation = new IndividualRelationState();
    relation.preyPlayerId = prey.id;
    relation.predatorPlayerId = predator.id;
    relation.preySpecies = prey.species;
    relation.predatorSpecies = predator.species;
    relation.count = 1;
    this.state.individualRelations.set(key, relation);
  }

  private advancePlayerReproduction(player: PlayerState, now: number): void {
    if (!isPlayableSpeciesId(player.species)) return;
    const meals = (this.mealsSinceBirth.get(player.id) ?? 0) + 1;
    if (meals < 3 || this.entityCountOf(player.species) >= SPECIES[player.species].maxPopulation) {
      this.mealsSinceBirth.set(player.id, meals);
      return;
    }
    this.mealsSinceBirth.set(player.id, 0);
    this.spawnAnimalNpc(player.species, player.x + 34, player.y + 28, now);
    this.broadcast("notice", { kind: "success", text: `${SPECIES[player.species].name} 개체가 한 마리 늘어났어요!` });
  }

  private spawnAnimalNpc(
    species: PlayableSpeciesId,
    x: number,
    y: number,
    now: number,
    options: Partial<Pick<AnimalNpcState, "breedingEnabled" | "fixed">> = {},
  ): AnimalNpcState {
    const npc = new AnimalNpcState();
    npc.id = `animal-${++this.npcSequence}`;
    npc.species = species;
    const position = clampToBounds(x, y, this.state.shrinkStage);
    npc.x = position.x;
    npc.y = position.y;
    npc.hunger = 100;
    npc.lastFoodAt = now;
    npc.reproduceReadyAt = now + 20000;
    npc.populationCount = 1;
    npc.status = "active";
    npc.extinct = false;
    npc.breedingEnabled = options.breedingEnabled ?? true;
    npc.fixed = options.fixed ?? false;
    this.state.animals.set(npc.id, npc);
    return npc;
  }

  private seedModeNpcs(mode: GameModeConfig, now: number): void {
    mode.npc.forEach((entry, entryIndex) => {
      for (let count = 0; count < entry.count; count += 1) {
        const spawn = SPAWN_POINTS[(entryIndex + count) % SPAWN_POINTS.length] ?? SPAWN_POINTS[0];
        const npc = this.spawnAnimalNpc(entry.species, spawn.x, spawn.y, now, {
          breedingEnabled: entry.breedingEnabled,
          fixed: true,
        });
        npc.reproduceReadyAt = entry.breedingEnabled ? now + 20000 : 0;
      }
    });
  }

  private populationOf(species: SpeciesId): number {
    let population = 0;
    this.state.players.forEach((player) => {
      if (player.species === species && player.status !== "extinct") population += Math.max(0, player.populationCount);
    });
    this.state.plants.forEach((plant) => {
      if (plant.species === species && plant.active) population += Math.max(0, plant.populationCount);
    });
    this.state.animals.forEach((animal) => {
      if (animal.species === species && !animal.extinct) population += Math.max(0, animal.populationCount);
    });
    return population;
  }

  /** Legacy experiment A/B still models one player/NPC as one simulated entity. */
  private entityCountOf(species: SpeciesId): number {
    let count = 0;
    this.state.players.forEach((player) => {
      if (player.species === species && player.status !== "extinct") count += 1;
    });
    this.state.animals.forEach((animal) => {
      if (animal.species === species && !animal.extinct) count += 1;
    });
    return count;
  }

  private handleSkill(client: Client): void {
    if (!isActivePlayPhase(this.state.phase as GamePhase) || this.state.paused) return;
    const player = this.state.players.get(client.sessionId);
    const now = Date.now();
    if (!player || player.status !== "active" || player.wrongUntil > now || player.skillReadyAt > now) return;
    if (!isPlayableSpeciesId(player.species)) return;
    const speciesId = player.species;
    const skill: SpeciesDefinition["skill"] = SPECIES[speciesId].skill;
    if (!skill) return;

    player.skillReadyAt = now + skill.cooldownMs;
    player.skillActiveUntil = now + skill.durationMs;
    player.escapeUntil = 0;
    player.shielded = Boolean(skill.invulnerable);
    player.stealth = skill.kind === "stealth";

    if (skill.kind === "leap" && skill.dashDistance) {
      const input = { x: player.facingX, y: player.facingY };
      const length = Math.hypot(input.x, input.y) || 1;
      const candidate = clampToBounds(
        player.x + (input.x / length) * skill.dashDistance,
        player.y + (input.y / length) * skill.dashDistance,
        this.state.shrinkStage,
      );
      if (!collidesWithObstacle(candidate.x, candidate.y)) {
        player.x = candidate.x;
        player.y = candidate.y;
      }
    }

    this.broadcast("action_effect", { kind: "skill", actorId: player.id, skillId: skill.id });
    client.send("notice", { kind: "skill", text: `${skill.name}!` });
  }

  private handleBlueEdge(client: Client, input: BlueEdgeInput): void {
    if (!isWebPhase(this.state.phase as GamePhase)) return;
    if (!isSpeciesId(input.prey) || !isSpeciesId(input.predator)) return;
    if (!canEat(input.predator, input.prey)) {
      client.send("notice", { kind: "warning", text: "이 관계는 다시 생각해 보세요." });
      return;
    }

    const key = relationKey(input.prey, input.predator);
    if (this.state.observedRelations.has(key) || this.state.blueRelations.has(key)) {
      client.send("notice", { kind: "info", text: "이미 먹이그물에 있는 관계예요." });
      return;
    }

    const edge = new RelationState();
    edge.prey = input.prey;
    edge.predator = input.predator;
    edge.count = 1;
    this.state.blueRelations.set(key, edge);
    this.broadcast("notice", { kind: "success", text: "먹이그물에 파란 관계선이 추가됐어요!" });
  }

  private handleTeacherCommand(client: Client, command: TeacherCommand): void {
    if (client.sessionId !== this.teacherSessionId) return;
    switch (command.action) {
      case "assign_roles":
        this.assignRoles();
        this.transitionTo("role_reveal");
        break;
      case "reveal_roles":
        this.transitionTo("role_reveal");
        break;
      case "set_role":
        if (command.playerId && command.species && isPlayableSpeciesId(command.species) && (this.state.phase === "lobby" || this.state.phase === "role_reveal")) {
          const player = this.state.players.get(command.playerId);
          if (player) player.species = command.species;
        }
        break;
      case "next_phase":
        this.transitionTo(command.phase ?? nextPhase(this.state.phase as GamePhase));
        break;
      case "pause":
        this.state.paused = true;
        this.broadcast("notice", { kind: "info", text: "선생님이 게임을 잠시 멈췄어요." });
        break;
      case "resume":
        this.state.paused = false;
        this.broadcast("notice", { kind: "info", text: "게임을 다시 시작해요!" });
        break;
      case "reset":
        this.resetClass();
        break;
      case "start_experiment":
        if (command.removedSpecies && isPlayableSpeciesId(command.removedSpecies)) {
          this.state.removedSpecies = command.removedSpecies;
          this.experimentSeed = Date.now() % 2147483647;
          this.transitionTo("experiment_a");
        }
        break;
      case "start_mode":
        if ((this.state.phase === "lobby" || this.state.phase === "role_reveal" || this.state.phase === "mode_setup" || this.state.phase === "mode_result") && command.modeId && isGameModeId(command.modeId)) {
          const removed = command.removedSpecies && isSpeciesId(command.removedSpecies) ? command.removedSpecies : undefined;
          this.startMode(command.modeId, removed);
        }
        break;
      case "adjust_time":
        if (isActivePlayPhase(this.state.phase as GamePhase) && Number.isFinite(command.deltaMs)) {
          const delta = Math.max(-60000, Math.min(60000, command.deltaMs ?? 0));
          this.state.timeRemainingMs = Math.max(0, Math.min(10 * 60 * 1000, this.state.timeRemainingMs + delta));
        }
        break;
    }
  }

  private assignRoles(): void {
    const shuffled = [...ROLE_DISTRIBUTION_23].sort(() => Math.random() - 0.5);
    let index = 0;
    this.state.players.forEach((player) => {
      player.species = shuffled[index % shuffled.length] ?? "grasshopper";
      index += 1;
    });
  }

  private startMode(modeId: GameModeId, removedSpecies?: SpeciesId): void {
    const resolvedRemoved = modeId === "chain_removal" ? "frog" : removedSpecies;
    const mode = modeConfig(modeId, resolvedRemoved);
    this.currentMode = mode;
    this.assignRolesForMode(mode);
    this.state.modeId = mode.id;
    this.state.modeNumber = mode.number;
    this.state.modeTitle = mode.title;
    this.state.removedSpecies = mode.removedSpecies ?? "";
    this.broadcast("notice", { kind: "info", text: `${mode.number}번 게임을 시작해요: ${mode.title}` });
    this.transitionTo("mode_play");
  }

  private assignRolesForMode(mode: GameModeConfig): void {
    if (!mode.playableSpecies.length) return;
    const shuffled = [...mode.playableSpecies].sort(() => Math.random() - 0.5);
    let index = 0;
    this.state.players.forEach((player) => {
      player.species = shuffled[index % shuffled.length] ?? mode.playableSpecies[0]!;
      index += 1;
    });
  }

  private resetModeState(mode: GameModeConfig): void {
    const now = Date.now();
    this.state.animals.clear();
    this.state.plants.clear();
    this.state.observedRelations.clear();
    this.state.blueRelations.clear();
    this.state.individualRelations.clear();
    this.state.populations.clear();
    this.mealsSinceBirth.clear();
    this.npcWander.clear();
    this.lastEatAt.clear();
    this.discoveredByPlayer.forEach((set) => set.clear());
    this.modeTimeline = [];
    this.nextTimelineAt = MODE_TIMELINE_INTERVAL_MS;
    this.state.modeElapsedMs = 0;
    this.state.modeResultJson = "";
    this.state.expectedRelations = mode.relations.length;

    let index = 0;
    this.state.players.forEach((player) => {
      const spawn = SPAWN_POINTS[index % SPAWN_POINTS.length] ?? SPAWN_POINTS[0];
      player.x = spawn.x;
      player.y = spawn.y;
      player.facingX = 0;
      player.facingY = 1;
      player.moveSpeed = isPlayableSpeciesId(player.species) && mode.playableSpecies.includes(player.species) ? SPECIES[player.species].baseSpeed : 0;
      player.boundsStage = 0;
      player.hunger = 100;
      player.wrongUntil = 0;
      player.eatReadyAt = 0;
      player.ghostUntil = 0;
      player.respawnAt = 0;
      player.skillReadyAt = 0;
      player.skillActiveUntil = 0;
      player.escapeUntil = 0;
      player.shielded = false;
      player.stealth = false;
      player.status = mode.playableSpecies.includes(player.species as PlayableSpeciesId) ? "active" : "extinct";
      player.populationCount = player.status === "active" ? 1 : 0;
      player.lastFoodAt = now;
      player.score = 0;
      player.eatAttempts = 0;
      player.successfulEats = 0;
      player.timesEaten = 0;
      player.survivalMs = 0;
      player.livesEnded = 0;
      if (player.status === "active") this.lifeStartedAt.set(player.id, now);
      else this.lifeStartedAt.delete(player.id);
      index += 1;
    });

    this.seedModePlants(mode);
    this.seedModeNpcs(mode, now);
    this.recordModeTimeline(0);
    this.refreshPopulationState();
  }

  private seedModePlants(mode: GameModeConfig): void {
    let index = 0;
    mode.producerSpecies.forEach((species) => {
      const requested = Math.max(0, mode.plantCounts[species] ?? 0);
      for (let count = 0; count < requested && index < mode.maxPlantEntities; count += 1) {
        const point = PLANT_SPAWN_POINTS[index % PLANT_SPAWN_POINTS.length] ?? PLANT_SPAWN_POINTS[0];
        const plant = new PlantState();
        plant.id = `plant-${index}`;
        plant.species = species;
        plant.x = point.x;
        plant.y = point.y;
        plant.active = true;
        plant.populationCount = 1;
        plant.respawnAt = 0;
        this.state.plants.set(plant.id, plant);
        index += 1;
      }
    });
  }

  private recordModeTimeline(elapsedMs: number): void {
    if (!this.currentMode) return;
    const populations: Partial<Record<SpeciesId, number>> = {};
    this.currentMode.activeSpecies.forEach((species) => {
      populations[species] = this.populationOf(species);
    });
    this.modeTimeline.push({ elapsedMs, populations });
  }

  private finishMode(): void {
    if (!this.currentMode || this.state.modeResultJson) return;
    this.refreshPopulationState();
    const lastPoint = this.modeTimeline[this.modeTimeline.length - 1];
    if (!lastPoint || lastPoint.elapsedMs !== this.state.modeElapsedMs) this.recordModeTimeline(this.state.modeElapsedMs);
    const finalPopulations: Partial<Record<SpeciesId, number>> = {};
    const peakPopulations: Partial<Record<SpeciesId, number>> = {};
    this.currentMode.activeSpecies.forEach((species) => {
      const population = this.state.populations.get(species);
      finalPopulations[species] = population?.count ?? this.populationOf(species);
      peakPopulations[species] = population?.peak ?? finalPopulations[species] ?? 0;
    });
    const players = [...this.state.players.values()]
      .filter((player) => isSpeciesId(player.species))
      .map((player) => ({
        id: player.id,
        name: player.name,
        species: player.species as SpeciesId,
        finalPopulation: player.populationCount,
        successfulEats: player.successfulEats,
        timesEaten: player.timesEaten,
        survivalMs: player.survivalMs,
        livesEnded: player.livesEnded,
      }));
    const result: ModeResult = {
      modeId: this.currentMode.id,
      modeNumber: this.currentMode.number,
      removedSpecies: this.currentMode.removedSpecies ?? "",
      durationMs: this.currentMode.durationMs,
      finalPopulations,
      peakPopulations,
      timeline: [...this.modeTimeline],
      players,
      observedRelations: [...this.state.observedRelations.values()]
        .filter((edge) => isSpeciesId(edge.prey) && isSpeciesId(edge.predator))
        .map((edge) => ({ prey: edge.prey as SpeciesId, predator: edge.predator as SpeciesId, count: edge.count })),
    };
    this.state.modeResultJson = JSON.stringify(result);
    this.completedModeResults.push(result);
    this.broadcast("mode_ready", result);
  }

  private transitionTo(phase: GamePhase): void {
    this.state.phase = phase;
    this.state.paused = false;
    this.state.shrinkStage = 0;
    if (phase === "mode_play") {
      if (!this.currentMode && isGameModeId(this.state.modeId)) {
        this.currentMode = modeConfig(this.state.modeId, isSpeciesId(this.state.removedSpecies) ? this.state.removedSpecies : undefined);
      }
      if (this.currentMode) {
        this.state.modeId = this.currentMode.id;
        this.state.modeNumber = this.currentMode.number;
        this.state.modeTitle = this.currentMode.title;
        this.state.timeRemainingMs = this.currentMode.durationMs;
        this.state.roundNumber = this.currentMode.number;
        this.resetModeState(this.currentMode);
      }
    } else if (phase === "round_1" || phase === "round_2") {
      // 기존 1·2판 흐름은 먹이그물 기록 화면과 호환되도록 전체 종을 유지한다.
      // 새 네 가지 활동은 mode_play에서만 modeConfig를 적용한다.
      this.currentMode = null;
      this.state.modeId = "";
      this.state.modeNumber = 0;
      this.state.modeTitle = "";
      this.state.modeElapsedMs = 0;
      this.state.removedSpecies = "";
      this.state.modeResultJson = "";
      this.state.roundNumber = phase === "round_1" ? 1 : 2;
      this.state.timeRemainingMs = ROUND_DURATION_MS;
      this.resetPlayersForRound();
      this.state.animals.clear();
      this.state.plants.clear();
      this.seedPlants();
      this.refreshPopulationState();
    } else if (phase === "experiment_a") {
      this.currentMode = null;
      this.state.timeRemainingMs = EXPERIMENT_DURATION_MS;
      this.state.modeId = "";
      this.state.modeNumber = 0;
      this.state.modeTitle = "";
      this.state.modeElapsedMs = 0;
      this.state.modeResultJson = "";
      this.resetPlayersForRound(true);
    } else if (phase === "mode_result") {
      this.state.timeRemainingMs = 0;
      this.finishMode();
    } else {
      this.state.timeRemainingMs = 0;
    }

    if (phase === "experiment_b") this.buildExperimentComparison();
    this.broadcast("phase_changed", { phase, label: PHASE_LABELS[phase] });
  }

  private resetPlayersForRound(experiment = false): void {
    if (experiment) {
      this.state.animals.clear();
      this.mealsSinceBirth.clear();
      this.npcWander.clear();
    }
    let index = 0;
    this.state.players.forEach((player) => {
      const spawn = SPAWN_POINTS[index % SPAWN_POINTS.length] ?? SPAWN_POINTS[0];
      player.x = spawn.x;
      player.y = spawn.y;
      player.facingX = 0;
      player.facingY = 1;
      player.moveSpeed = isPlayableSpeciesId(player.species) ? SPECIES[player.species].baseSpeed : 0;
      player.boundsStage = 0;
      player.hunger = 100;
      player.wrongUntil = 0;
      player.eatReadyAt = 0;
      player.ghostUntil = 0;
      player.respawnAt = 0;
      player.skillReadyAt = 0;
      player.skillActiveUntil = 0;
      player.escapeUntil = 0;
      player.shielded = false;
      player.stealth = false;
      const allowed = !this.currentMode || this.currentMode.playableSpecies.includes(player.species as PlayableSpeciesId);
      player.status = experiment && player.species === this.state.removedSpecies || !allowed ? "extinct" : "active";
      player.populationCount = player.status === "active" ? 1 : 0;
      player.lastFoodAt = Date.now();
      if (player.status === "active") this.lifeStartedAt.set(player.id, Date.now());
      else this.lifeStartedAt.delete(player.id);
      index += 1;
    });
    this.refreshPopulationState();
  }

  private resetClass(): void {
    this.state.phase = "lobby";
    this.state.paused = false;
    this.state.timeRemainingMs = 0;
    this.state.shrinkStage = 0;
    this.state.roundNumber = 0;
    this.state.modeId = "";
    this.state.modeNumber = 0;
    this.state.modeTitle = "";
    this.state.modeElapsedMs = 0;
    this.state.removedSpecies = "";
    this.state.experimentJson = "";
    this.state.modeResultJson = "";
    this.state.observedRelations.clear();
    this.state.blueRelations.clear();
    this.state.individualRelations.clear();
    this.state.animals.clear();
    this.state.plants.clear();
    this.state.populations.clear();
    this.mealsSinceBirth.clear();
    this.npcWander.clear();
    this.state.players.forEach((player) => {
      player.score = 0;
      player.status = "active";
      player.hunger = 100;
      player.wrongUntil = 0;
      player.eatReadyAt = 0;
      player.ghostUntil = 0;
      player.skillReadyAt = 0;
      player.skillActiveUntil = 0;
      player.escapeUntil = 0;
      player.shielded = false;
      player.stealth = false;
      player.moveSpeed = isPlayableSpeciesId(player.species) ? SPECIES[player.species].baseSpeed : 0;
      player.boundsStage = 0;
      player.eatAttempts = 0;
      player.successfulEats = 0;
      player.timesEaten = 0;
      player.survivalMs = 0;
      player.livesEnded = 0;
      player.populationCount = 1;
      player.lastFoodAt = 0;
      player.respawnAt = 0;
    });
    this.lifeStartedAt.clear();
    this.lastEatAt.clear();
    this.discoveredByPlayer.forEach((set) => set.clear());
    this.currentMode = null;
    this.modeTimeline = [];
    this.nextTimelineAt = 0;
    this.completedModeResults = [];
    this.seedPlants();
    this.refreshPopulationState();
  }

  private updateWorld(deltaMs: number, deltaSeconds: number): void {
    const now = Date.now();
    const playerInputs = new Map<string, MoveInput>();
    this.state.players.forEach((_player, sessionId) => {
      playerInputs.set(sessionId, this.inputs.get(sessionId).next());
    });

    if (!isActivePlayPhase(this.state.phase as GamePhase) || this.state.paused) return;
    this.updatePlants(now);
    this.updateTimedStatuses(now);
    this.state.timeRemainingMs = Math.max(0, this.state.timeRemainingMs - deltaMs);
    if (this.currentMode && this.state.phase === "mode_play") {
      this.state.modeElapsedMs = Math.min(this.currentMode.durationMs, this.state.modeElapsedMs + deltaMs);
      if (this.state.modeElapsedMs >= this.nextTimelineAt) {
        this.recordModeTimeline(this.state.modeElapsedMs);
        this.nextTimelineAt = this.state.modeElapsedMs + MODE_TIMELINE_INTERVAL_MS;
      }
    }

    if (this.state.phase === "round_1" || this.state.phase === "round_2") {
      const elapsed = ROUND_DURATION_MS - this.state.timeRemainingMs;
      this.state.shrinkStage = elapsed >= 4 * 60 * 1000 ? 2 : elapsed >= 3 * 60 * 1000 ? 1 : 0;
    }

    this.state.players.forEach((player, sessionId) => {
      this.updatePlayer(player, playerInputs.get(sessionId), deltaMs, deltaSeconds, now);
    });
    if ((this.currentMode && this.state.phase === "mode_play") || this.state.phase === "experiment_a") this.updateAnimalNpcs(deltaMs, now);
    this.refreshPopulationState();

    if (this.state.timeRemainingMs <= 0) {
      if (this.state.phase === "round_1") this.transitionTo("web_review_1");
      else if (this.state.phase === "round_2") this.transitionTo("web_review_2");
      else if (this.state.phase === "experiment_a") this.transitionTo("experiment_b");
      else if (this.state.phase === "mode_play") this.transitionTo("mode_result");
    }
  }

  private updatePlants(now: number): void {
    this.state.plants.forEach((plant) => {
      if (!plant.active && plant.respawnAt <= now) {
        plant.active = true;
        plant.respawnAt = 0;
        this.broadcast("action_effect", { kind: "population", actorId: plant.id, delta: 1, species: plant.species as SpeciesId });
      }
    });
  }

  private updateTimedStatuses(now: number): void {
    this.state.players.forEach((player, sessionId) => {
      if (player.status === "respawning" && player.respawnAt > 0 && player.respawnAt <= now) {
        player.status = "active";
        player.respawnAt = 0;
        const spawn = this.safestSpawn(player.species);
        player.x = spawn.x;
        player.y = spawn.y;
        player.hunger = 100;
        player.lastFoodAt = now;
        this.lifeStartedAt.set(player.id, now);
        this.broadcast("action_effect", { kind: "respawn", actorId: player.id });
      }
      if (player.status === "ghost" && player.ghostUntil > 0 && player.ghostUntil <= now) {
        player.status = "active";
        player.ghostUntil = 0;
        player.populationCount = Math.max(1, player.populationCount);
        const spawn = this.safestSpawn(player.species);
        player.x = spawn.x;
        player.y = spawn.y;
        player.hunger = 100;
        player.lastFoodAt = now;
        this.lifeStartedAt.set(player.id, now);
        this.broadcast("action_effect", { kind: "respawn", actorId: player.id });
      }
      if (player.skillActiveUntil > 0 && player.skillActiveUntil <= now) {
        const finishedShield = player.shielded;
        player.skillActiveUntil = 0;
        player.shielded = false;
        player.stealth = false;
        if (finishedShield && player.species === "caterpillar") {
          player.escapeUntil = now + CATERPILLAR_ESCAPE_MS;
        }
      }
      if (!player.connected && (this.disconnectedAt.get(sessionId) ?? now) + 30000 <= now) {
        this.state.players.delete(sessionId);
      }
    });
    this.state.animals.forEach((animal) => {
      if (animal.status === "respawning" && animal.respawnAt > 0 && animal.respawnAt <= now) {
        animal.status = "active";
        animal.respawnAt = 0;
        const spawn = this.safestSpawn(animal.species);
        animal.x = spawn.x;
        animal.y = spawn.y;
        animal.hunger = 100;
        animal.lastFoodAt = now;
      } else if (animal.status === "ghost" && animal.ghostUntil > 0 && animal.ghostUntil <= now) {
        animal.status = "active";
        animal.ghostUntil = 0;
        animal.populationCount = Math.max(1, animal.populationCount);
        const spawn = this.safestSpawn(animal.species);
        animal.x = spawn.x;
        animal.y = spawn.y;
        animal.hunger = 100;
        animal.lastFoodAt = now;
      }
    });
  }

  private updatePlayer(player: PlayerState, input: MoveInput | undefined, deltaMs: number, deltaSeconds: number, now: number): void {
    if (player.status === "extinct" || player.status === "respawning") {
      player.moveSpeed = 0;
      return;
    }
    const species = isPlayableSpeciesId(player.species) ? SPECIES[player.species] : SPECIES.grasshopper;
    const activeSkill: SpeciesDefinition["skill"] = species.skill && player.skillActiveUntil > now ? species.skill : undefined;
    const cannotMove = player.wrongUntil > now || Boolean(activeSkill?.movementLocked);
    const hungerMultiplier = player.hunger <= 0 ? 0.7 : 1;
    const escapeMultiplier = player.escapeUntil > now ? CATERPILLAR_ESCAPE_SPEED : 1;
    const skillMultiplier = (activeSkill?.speedMultiplier ?? 1) * escapeMultiplier;
    const ghostMultiplier = player.status === "ghost" ? 1.12 : 1;
    const speed = species.baseSpeed * hungerMultiplier * skillMultiplier * ghostMultiplier;
    player.moveSpeed = cannotMove ? 0 : speed;
    player.boundsStage = this.state.shrinkStage;

    if (input) applyMovement(player, input, deltaSeconds);

    if (player.status === "active") {
      player.hunger = Math.max(0, player.hunger - HUNGER_PER_SECOND * (deltaMs / 1000));
      if (this.state.phase === "experiment_a" && player.hunger <= 0) {
        this.recordLifeEnd(player, now, false);
        player.populationCount = 0;
        player.status = "extinct";
        this.broadcast("action_effect", { kind: "population", actorId: player.id, delta: -1, species: player.species as SpeciesId });
        return;
      }
      const starvationTimeout = this.currentMode?.starvationTimeoutMs ?? (this.state.phase === "experiment_a" ? 0 : 0);
      if (this.currentMode && starvationTimeout > 0 && now - player.lastFoodAt >= starvationTimeout) {
        this.recordLifeEnd(player, now, false);
        player.populationCount = Math.max(0, player.populationCount - 1);
        this.broadcast("action_effect", { kind: "population", actorId: player.id, delta: -1, species: player.species as SpeciesId });
        if (player.populationCount > 0) {
          player.status = "respawning";
          player.respawnAt = now + this.currentMode.starvationRespawnDelayMs;
        } else {
          player.status = "ghost";
          player.ghostUntil = now + this.currentMode.ghostDurationMs;
        }
        player.lastFoodAt = now;
        this.broadcast("notice", { kind: "warning", text: `${player.name}의 ${SPECIES[player.species as PlayableSpeciesId].name}가 먹이를 찾지 못했어요.` });
      }
    }
  }

  private updateAnimalNpcs(deltaMs: number, now: number): void {
    this.state.animals.forEach((animal) => {
      if (!isPlayableSpeciesId(animal.species) || animal.status !== "active" || animal.extinct) return;
      animal.hunger = Math.max(0, animal.hunger - HUNGER_PER_SECOND * 0.82 * (deltaMs / 1000));
      const starvationTimeout = this.currentMode?.starvationTimeoutMs ?? 0;
      if (starvationTimeout > 0 && now - animal.lastFoodAt >= starvationTimeout) {
        animal.populationCount = Math.max(0, animal.populationCount - 1);
        this.broadcast("action_effect", { kind: "population", actorId: animal.id, delta: -1, species: animal.species as SpeciesId });
        if (animal.populationCount > 0) {
          animal.status = "respawning";
          animal.respawnAt = now + (this.currentMode?.starvationRespawnDelayMs ?? 10000);
        } else if (animal.fixed && this.currentMode?.npc.some((entry) => entry.species === animal.species && !entry.respawnWhenExtinct)) {
          animal.status = "extinct";
          animal.extinct = true;
        } else {
          animal.status = "ghost";
          animal.ghostUntil = now + (this.currentMode?.ghostDurationMs ?? GHOST_DURATION_MS);
        }
        animal.lastFoodAt = now;
        return;
      }

      const target = this.nearestFoodFor(animal.species, animal.x, animal.y, animal.id);
      let direction = this.npcWander.get(animal.id);
      if (target && target.distance < 430) {
        const length = target.distance || 1;
        direction = { x: (target.x - animal.x) / length, y: (target.y - animal.y) / length, changeAt: now + 500 };
      } else if (!direction || direction.changeAt <= now) {
        const angle = Math.random() * Math.PI * 2;
        direction = { x: Math.cos(angle), y: Math.sin(angle), changeAt: now + 1800 + Math.random() * 2200 };
      }
      this.npcWander.set(animal.id, direction);

      if (target && target.distance <= EAT_RANGE * 0.82) {
        if (this.consumeNpcTarget(animal, target.id, target.kind, target.species, now)) return;
      }

      const speed = SPECIES[animal.species].baseSpeed * 0.72;
      const next = clampToBounds(animal.x + direction.x * speed * (deltaMs / 1000), animal.y + direction.y * speed * (deltaMs / 1000), this.state.shrinkStage);
      if (!collidesWithObstacle(next.x, animal.y)) animal.x = next.x;
      else direction.changeAt = 0;
      if (!collidesWithObstacle(animal.x, next.y)) animal.y = next.y;
      else direction.changeAt = 0;
    });

    this.refreshPopulationState();
  }

  private nearestFoodFor(species: PlayableSpeciesId, x: number, y: number, selfId: string): { id: string; kind: "plant" | "player" | "animal"; species: string; x: number; y: number; distance: number } | null {
    const candidates: Array<{ id: string; kind: "plant" | "player" | "animal"; species: string; x: number; y: number; distance: number }> = [];
    this.state.plants.forEach((plant) => {
      if (plant.active && this.isSpeciesActiveInMode(plant.species) && this.canEatInCurrentPhase(species, plant.species)) candidates.push({ id: plant.id, kind: "plant", species: plant.species, x: plant.x, y: plant.y, distance: Math.hypot(plant.x - x, plant.y - y) });
    });
    this.state.players.forEach((player) => {
      if (player.status === "active" && this.isSpeciesActiveInMode(player.species) && this.canEatInCurrentPhase(species, player.species)) candidates.push({ id: player.id, kind: "player", species: player.species, x: player.x, y: player.y, distance: Math.hypot(player.x - x, player.y - y) });
    });
    this.state.animals.forEach((animal) => {
      if (animal.id !== selfId && animal.status === "active" && !animal.extinct && this.isSpeciesActiveInMode(animal.species) && this.canEatInCurrentPhase(species, animal.species)) candidates.push({ id: animal.id, kind: "animal", species: animal.species, x: animal.x, y: animal.y, distance: Math.hypot(animal.x - x, animal.y - y) });
    });
    return candidates.sort((a, b) => a.distance - b.distance)[0] ?? null;
  }

  private consumeNpcTarget(predator: AnimalNpcState, targetId: string, kind: "plant" | "player" | "animal", preySpecies: string, now: number): boolean {
    if (kind === "plant") {
      const plant = this.state.plants.get(targetId);
      if (!plant?.active) return false;
      this.consumePlant(plant, now);
    } else if (kind === "player") {
      const player = this.state.players.get(targetId);
      if (!player || player.status !== "active" || player.shielded) return false;
      this.consumePlayer(player, now);
    } else {
      const target = this.state.animals.get(targetId);
      if (!target || target.status !== "active" || target.extinct) return false;
      this.consumeAnimalNpc(target, now);
    }

    predator.hunger = Math.min(100, predator.hunger + 32);
    this.increasePopulation(predator, now);
    predator.meals += 1;
    this.recordObservedRelation(preySpecies, predator.species);
    this.broadcast("action_effect", { kind: "eat", actorId: predator.id, targetId });
    this.broadcast("action_effect", { kind: "population", actorId: predator.id, targetId, delta: 1, species: predator.species as SpeciesId });
    if (predator.breedingEnabled && predator.meals >= 3 && predator.reproduceReadyAt <= now && isPlayableSpeciesId(predator.species) && this.populationOf(predator.species) < SPECIES[predator.species].maxPopulation) {
      predator.meals = 0;
      predator.reproduceReadyAt = now + 20000;
      this.spawnAnimalNpc(predator.species, predator.x + 28, predator.y - 25, now, { breedingEnabled: true, fixed: false });
      this.broadcast("notice", { kind: "success", text: `${SPECIES[predator.species].name} NPC가 번식했어요!` });
    }
    return true;
  }

  private safestSpawn(species: string): { x: number; y: number } {
    let best: { x: number; y: number } = clampToBounds(SPAWN_POINTS[0].x, SPAWN_POINTS[0].y, this.state.shrinkStage);
    let bestDistance = -1;
    for (const rawSpawn of SPAWN_POINTS) {
      const spawn = clampToBounds(rawSpawn.x, rawSpawn.y, this.state.shrinkStage);
      if (collidesWithObstacle(spawn.x, spawn.y)) continue;
      let nearestPredator = Number.POSITIVE_INFINITY;
      this.state.players.forEach((other) => {
        if (other.status === "active" && this.isSpeciesActiveInMode(other.species) && this.canEatInCurrentPhase(other.species, species)) {
          nearestPredator = Math.min(nearestPredator, Math.hypot(other.x - spawn.x, other.y - spawn.y));
        }
      });
      this.state.animals.forEach((other) => {
        if (other.status === "active" && !other.extinct && this.isSpeciesActiveInMode(other.species) && this.canEatInCurrentPhase(other.species, species)) {
          nearestPredator = Math.min(nearestPredator, Math.hypot(other.x - spawn.x, other.y - spawn.y));
        }
      });
      if (nearestPredator > bestDistance) {
        best = spawn;
        bestDistance = nearestPredator;
      }
    }
    return best;
  }

  private buildExperimentComparison(): void {
    const initial: Partial<Record<SpeciesId, number>> = { grass: 20, berry: 12 };
    this.state.players.forEach((player) => {
      if (!isSpeciesId(player.species)) return;
      initial[player.species] = (initial[player.species] ?? 0) + 1;
    });
    const removed = isSpeciesId(this.state.removedSpecies) ? this.state.removedSpecies : "frog";
    const observedKeys = [...this.state.observedRelations.keys()];
    const blueKeys = [...this.state.blueRelations.keys()];
    const observedEdges = edgesFromKeys(observedKeys);
    const completedEdges = edgesFromKeys([...observedKeys, ...blueKeys]);
    const a = simulateEcosystem({ initial, relations: observedEdges, removedSpecies: removed, seed: this.experimentSeed });
    const b = simulateEcosystem({ initial, relations: completedEdges, removedSpecies: removed, seed: this.experimentSeed });
    this.state.experimentJson = JSON.stringify({ a, b });
    this.broadcast("experiment_ready", { a, b });
  }

  private sendResult(client: Client): void {
    client.send("class_result", {
      roomCode: this.state.roomCode,
      players: [...this.state.players.values()].map((player) => ({
        name: player.name,
        species: player.species,
        score: player.score,
        balance: {
          eatAttempts: player.eatAttempts,
          successfulEats: player.successfulEats,
          timesEaten: player.timesEaten,
          averageSurvivalSeconds: player.livesEnded ? Math.round(player.survivalMs / player.livesEnded / 1000) : null,
        },
      })),
      observedRelations: [...this.state.observedRelations.values()].map((edge) => ({ prey: edge.prey, predator: edge.predator, count: edge.count })),
      blueRelations: [...this.state.blueRelations.values()].map((edge) => ({ prey: edge.prey, predator: edge.predator })),
      individualRelations: [...this.state.individualRelations.values()].map((edge) => ({
        preyPlayerId: edge.preyPlayerId,
        predatorPlayerId: edge.predatorPlayerId,
        preySpecies: edge.preySpecies,
        predatorSpecies: edge.predatorSpecies,
        count: edge.count,
      })),
      experiment: this.state.experimentJson ? JSON.parse(this.state.experimentJson) : null,
      mode: this.state.modeId || null,
      currentModeResult: this.state.modeResultJson ? JSON.parse(this.state.modeResultJson) : null,
      modeResults: [...this.completedModeResults],
      populations: [...this.state.populations.values()].map((population) => ({ species: population.species, count: population.count, peak: population.peak })),
    });
  }
}
