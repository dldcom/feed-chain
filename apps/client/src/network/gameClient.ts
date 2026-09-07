import { Client, type Room } from "@colyseus/sdk";
import { EAT_RANGE, isGameModeId, isWithinEatReach, modeConfig, isSpeciesId, type ActionEffect, type ExperimentComparison, type GameNotice, type ModeResult, type TeacherCommand } from "@feed-chain/shared";
import { EMPTY_SNAPSHOT, type AnimalSnapshot, type GameSnapshot, type IndividualRelationSnapshot, type PlantSnapshot, type PlayerSnapshot, type PopulationSnapshot, type RelationSnapshot } from "../types";
import { useGameStore } from "../store/gameStore";
import { configureMovementNetcode, disposeMovementNetcode, movementLogicPose } from "./movementNetcode";

const endpoint = import.meta.env.VITE_SERVER_URL ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`;
const client = new Client(endpoint);
const visibleSpeciesByPlayer = new Map<string, string>();
let visibleSpeciesModeInstanceId = 0;

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint8Array(6));
  return [...values].map((value) => alphabet[value % alphabet.length]).join("");
}

function collectionValues<T>(collection: unknown, mapper: (value: any, key: string) => T): T[] {
  const results: T[] = [];
  if (collection && typeof (collection as { forEach?: unknown }).forEach === "function") {
    (collection as { forEach: (callback: (value: any, key: string) => void) => void }).forEach((value, key) => results.push(mapper(value, key)));
  }
  return results;
}

function serializeState(state: any): GameSnapshot {
  let experiment = null;
  try {
    experiment = state.experimentJson ? JSON.parse(state.experimentJson) : null;
  } catch {
    experiment = null;
  }
  let modeResult: ModeResult | null = null;
  try {
    modeResult = state.modeResultJson ? JSON.parse(state.modeResultJson) : null;
  } catch {
    modeResult = null;
  }
  const modeId = typeof state.modeId === "string" && isGameModeId(state.modeId) ? state.modeId : "";
  return {
    ...EMPTY_SNAPSHOT,
    phase: state.phase ?? EMPTY_SNAPSHOT.phase,
    roomCode: state.roomCode ?? EMPTY_SNAPSHOT.roomCode,
    paused: state.paused ?? EMPTY_SNAPSHOT.paused,
    timeRemainingMs: state.timeRemainingMs ?? EMPTY_SNAPSHOT.timeRemainingMs,
    shrinkStage: state.shrinkStage ?? EMPTY_SNAPSHOT.shrinkStage,
    roundNumber: state.roundNumber ?? EMPTY_SNAPSHOT.roundNumber,
    modeId,
    modeNumber: state.modeNumber ?? EMPTY_SNAPSHOT.modeNumber,
    modeTitle: state.modeTitle ?? EMPTY_SNAPSHOT.modeTitle,
    modeElapsedMs: state.modeElapsedMs ?? EMPTY_SNAPSHOT.modeElapsedMs,
    modeInstanceId: state.modeInstanceId ?? EMPTY_SNAPSHOT.modeInstanceId,
    roleRevealEndsAt: state.roleRevealEndsAt ?? EMPTY_SNAPSHOT.roleRevealEndsAt,
    removedSpecies: state.removedSpecies ?? EMPTY_SNAPSHOT.removedSpecies,
    expectedRelations: state.expectedRelations ?? EMPTY_SNAPSHOT.expectedRelations,
    experiment,
    players: collectionValues<PlayerSnapshot>(state.players, (player, key) => ({
      id: player.id || key,
      name: player.name,
      species: player.species || visibleSpeciesByPlayer.get(player.id || key) || "",
      x: player.x,
      y: player.y,
      facingX: player.facingX ?? 0,
      facingY: player.facingY ?? 1,
      moveSpeed: player.moveSpeed,
      boundsStage: player.boundsStage,
      status: player.status,
      score: player.score,
      hunger: player.hunger,
      wrongUntil: player.wrongUntil,
      eatReadyAt: player.eatReadyAt,
      ghostUntil: player.ghostUntil,
      skillReadyAt: player.skillReadyAt,
      skillActiveUntil: player.skillActiveUntil,
      escapeUntil: player.escapeUntil,
      shielded: player.shielded,
      stealth: player.stealth,
      connected: player.connected,
      eatAttempts: player.eatAttempts ?? 0,
      successfulEats: player.successfulEats ?? 0,
      timesEaten: player.timesEaten ?? 0,
      survivalMs: player.survivalMs ?? 0,
      livesEnded: player.livesEnded ?? 0,
      populationCount: player.populationCount ?? 1,
      lastFoodAt: player.lastFoodAt ?? 0,
      respawnAt: player.respawnAt ?? 0,
    })),
    plants: collectionValues<PlantSnapshot>(state.plants, (plant, key) => ({
      id: plant.id || key,
      species: plant.species,
      x: plant.x,
      y: plant.y,
      active: plant.active,
      respawnAt: plant.respawnAt,
      populationCount: plant.populationCount ?? 1,
    })),
    animals: collectionValues<AnimalSnapshot>(state.animals, (animal, key) => ({
      id: animal.id || key,
      species: animal.species,
      x: animal.x,
      y: animal.y,
      hunger: animal.hunger,
      meals: animal.meals,
      status: animal.status ?? "active",
      populationCount: animal.populationCount ?? 1,
      respawnAt: animal.respawnAt ?? 0,
      ghostUntil: animal.ghostUntil ?? 0,
      lastFoodAt: animal.lastFoodAt ?? 0,
      breedingEnabled: animal.breedingEnabled ?? true,
      fixed: animal.fixed ?? false,
      extinct: animal.extinct ?? false,
    })),
    populations: collectionValues<PopulationSnapshot>(state.populations, (population, key) => ({
      species: population.species || key,
      count: population.count ?? 0,
      peak: population.peak ?? population.count ?? 0,
    })),
    observedRelations: collectionValues<RelationSnapshot>(state.observedRelations, (edge) => ({ prey: edge.prey, predator: edge.predator, count: edge.count })),
    blueRelations: collectionValues<RelationSnapshot>(state.blueRelations, (edge) => ({ prey: edge.prey, predator: edge.predator, count: edge.count })),
    individualRelations: collectionValues<IndividualRelationSnapshot>(state.individualRelations, (edge) => ({
      preyPlayerId: edge.preyPlayerId,
      predatorPlayerId: edge.predatorPlayerId,
      preySpecies: edge.preySpecies,
      predatorSpecies: edge.predatorSpecies,
      count: edge.count,
    })),
    modeResult,
  };
}

function attachRoom(room: Room, role: "teacher" | "student"): void {
  const store = useGameStore.getState();
  store.setSession(room, role);
  let netcodeConfigured = false;
  const applyState = (state: any) => {
    const modeInstanceId = Number(state.modeInstanceId ?? 0);
    // Do not carry the previous mode's public role map into a new private
    // briefing window. It is repopulated only by the next public_species
    // message after the ten-second reveal.
    if (modeInstanceId !== visibleSpeciesModeInstanceId) {
      visibleSpeciesByPlayer.clear();
      visibleSpeciesModeInstanceId = modeInstanceId;
    }
    useGameStore.getState().setSnapshot(serializeState(state));
    const ready = typeof state.phase === "string" && (role === "teacher" || state.players?.get(room.sessionId));
    if (!netcodeConfigured && ready) {
      configureMovementNetcode(room, role === "student");
      netcodeConfigured = true;
    }
  };
  room.onMessage("role_briefing", (briefing) => useGameStore.getState().setRoleBriefing(briefing));
  room.onMessage("teacher_roles", (assignments) => useGameStore.getState().setTeacherAssignments(assignments));
  room.onMessage("role_reveal_finished", () => useGameStore.getState().setRoleBriefing(null));
  room.onMessage("public_species", (payload: { modeInstanceId?: number; species?: Record<string, string> }) => {
    if (Number.isFinite(payload?.modeInstanceId)) visibleSpeciesModeInstanceId = Number(payload.modeInstanceId);
    if (payload?.species) {
      Object.entries(payload.species).forEach(([playerId, species]) => visibleSpeciesByPlayer.set(playerId, species));
      useGameStore.getState().setSnapshot(serializeState(room.state));
    }
  });

  room.onStateChange(applyState);
  applyState(room.state);
  sessionStorage.setItem("feed-chain-reconnection", room.reconnectionToken);
  sessionStorage.setItem("feed-chain-role", role);

  room.onMessage("notice", (notice: GameNotice) => useGameStore.getState().showNotice(notice));
  room.onMessage("action_effect", (effect: ActionEffect) => useGameStore.getState().showEffect(effect));
  room.onMessage("experiment_ready", (comparison: ExperimentComparison) => {
    const current = useGameStore.getState().snapshot;
    useGameStore.getState().setSnapshot({ ...current, experiment: comparison });
  });
  room.onMessage("mode_ready", (result: ModeResult) => {
    const current = useGameStore.getState().snapshot;
    useGameStore.getState().setSnapshot({ ...current, modeResult: result });
  });
  room.onMessage("class_result", (result: unknown) => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `먹이그물-${useGameStore.getState().snapshot.roomCode}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  });
  room.onLeave(() => useGameStore.getState().setConnection(false));
}

export async function createClass(nickname: string): Promise<void> {
  useGameStore.getState().setConnecting(true);
  visibleSpeciesByPlayer.clear();
  visibleSpeciesModeInstanceId = 0;
  const teacherToken = crypto.randomUUID();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const room = await client.create("ecosystem", {
        roomCode: randomCode(),
        teacherToken,
        isTeacher: true,
        nickname,
      });
      sessionStorage.setItem("feed-chain-teacher-token", teacherToken);
      attachRoom(room, "teacher");
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

export async function joinClass(roomCode: string, nickname: string): Promise<void> {
  useGameStore.getState().setConnecting(true);
  visibleSpeciesByPlayer.clear();
  visibleSpeciesModeInstanceId = 0;
  const room = await client.joinById(roomCode.trim().toUpperCase(), { nickname });
  attachRoom(room, "student");
}

export async function reconnectClass(): Promise<boolean> {
  const token = sessionStorage.getItem("feed-chain-reconnection");
  const role = sessionStorage.getItem("feed-chain-role");
  if (!token || (role !== "teacher" && role !== "student")) return false;
  try {
    const room = await client.reconnect(token);
    attachRoom(room, role);
    return true;
  } catch {
    sessionStorage.removeItem("feed-chain-reconnection");
    return false;
  }
}

export function eatNearest(): void {
  const { room, snapshot, selfId } = useGameStore.getState();
  const self = snapshot.players.find((player) => player.id === selfId);
  if (!room || !self || self.status !== "active") return;
  // Interaction must use the reconciler's exact predicted pose, not the
  // interpolated display pose used by Phaser rendering.
  const pose = movementLogicPose(selfId) ?? self;
  const configuredMode = isGameModeId(snapshot.modeId)
    ? modeConfig(snapshot.modeId, isSpeciesId(snapshot.removedSpecies) ? snapshot.removedSpecies : undefined)
    : null;
  const activeSpecies = configuredMode ? new Set<string>(configuredMode.activeSpecies) : null;
  const candidates = [
    ...snapshot.players.filter((player) => player.id !== selfId && player.connected && player.status === "active" && (!activeSpecies || activeSpecies.has(player.species))),
    ...snapshot.plants.filter((plant) => plant.active && (!activeSpecies || activeSpecies.has(plant.species))),
    ...snapshot.animals.filter((animal) => animal.status === "active" && !animal.extinct && (!activeSpecies || activeSpecies.has(animal.species))),
  ];
  const nearest = candidates
    .map((candidate) => ({ candidate, distance: Math.hypot(candidate.x - pose.x, candidate.y - pose.y) }))
    .filter(({ candidate, distance }) => distance <= EAT_RANGE && isWithinEatReach(pose, candidate))
    .sort((a, b) => a.distance - b.distance);
  if (nearest[0]) room.send("eat", { targetId: nearest[0].candidate.id, facingX: pose.facingX, facingY: pose.facingY });
}

export function useSkill(): void {
  useGameStore.getState().room?.send("skill");
}

export function sendBlueEdge(prey: string, predator: string): void {
  useGameStore.getState().room?.send("blue_edge", { prey, predator });
}

export function sendTeacherCommand(command: TeacherCommand): void {
  useGameStore.getState().room?.send("teacher", command);
}

export function downloadClassResult(): void {
  useGameStore.getState().room?.send("download_result");
}

export async function leaveClass(): Promise<void> {
  disposeMovementNetcode();
  await useGameStore.getState().room?.leave(true);
  visibleSpeciesByPlayer.clear();
  sessionStorage.removeItem("feed-chain-reconnection");
  sessionStorage.removeItem("feed-chain-role");
  useGameStore.getState().reset();
}
