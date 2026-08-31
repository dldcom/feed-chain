import Phaser from "phaser";
import {
  EAT_COOLDOWN_MS,
  EAT_RANGE,
  PLANT_SPAWN_POINTS,
  PLAYABLE_SPECIES,
  PLAYER_RADIUS,
  SPAWN_POINTS,
  SPECIES,
  WORLD_HEIGHT,
  WORLD_OBSTACLES,
  WORLD_WIDTH,
  canEat,
  foodsFor,
  isPlayableSpeciesId,
  isWithinEatReach,
  type PlayableSpeciesId,
  type SpeciesId,
} from "@feed-chain/shared";
import {
  RABBIT_FRAME_HEIGHT,
  RABBIT_FRAME_WIDTH,
  rabbitIdleFrame,
  rabbitSickFrame,
} from "./rabbitAnimations";

interface TestTarget {
  id: string;
  speciesId: SpeciesId;
  x: number;
  y: number;
  active: boolean;
  visual: Phaser.GameObjects.Container;
}

export interface GameTestStatus {
  speciesId: PlayableSpeciesId;
  skillName: string;
  cooldownRemainingMs: number;
  activeRemainingMs: number;
  eatRemainingMs: number;
  wrongRemainingMs: number;
  hunger: number;
  score: number;
  discovered: number;
  totalRelations: number;
  timeRemainingMs: number;
  position: { x: number; y: number };
}

interface GameTestSceneOptions {
  initialSpeciesId: PlayableSpeciesId;
  onReady: (scene: GameTestScene) => void;
  onStatus: (status: GameTestStatus) => void;
}

export class GameTestScene extends Phaser.Scene {
  private readonly options: GameTestSceneOptions;
  private speciesId: PlayableSpeciesId;
  private player?: Phaser.GameObjects.Container;
  private atlasSprite?: Phaser.GameObjects.Image;
  private rabbitSprite?: Phaser.GameObjects.Sprite;
  private rabbitEffectRoot?: Phaser.GameObjects.Container;
  private playerBody?: Phaser.GameObjects.Arc;
  private playerRing?: Phaser.GameObjects.Arc;
  private roleLabel?: Phaser.GameObjects.Text;
  private stateLabel?: Phaser.GameObjects.Text;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<string, Phaser.Input.Keyboard.Key>;
  private skillKey?: Phaser.Input.Keyboard.Key;
  private virtualInput = { x: 0, y: 0 };
  private facing = { x: 0, y: 1 };
  private skillReadyAt = 0;
  private skillActiveUntil = 0;
  private lastStatusAt = -Infinity;
  private hopPhase = 0;
  private targets: TestTarget[] = [];
  private targetRing?: Phaser.GameObjects.Arc;
  private targetHint?: Phaser.GameObjects.Text;
  private eatReadyAt = 0;
  private wrongUntil = 0;
  private hunger = 100;
  private score = 0;
  private discoveredFoods = new Set<SpeciesId>();
  private rabbitAction: "sick" | null = null;
  private rabbitActionTimer?: Phaser.Time.TimerEvent;
  private rabbitEatTween?: Phaser.Tweens.Tween;

  constructor(options: GameTestSceneOptions) {
    super("game-test");
    this.options = options;
    this.speciesId = options.initialSpeciesId;
  }

  preload(): void {
    this.load.image("test-species-atlas", "/assets/pixel/species-atlas.png");
    this.load.spritesheet("test-rabbit-jump", "/assets/pixel/animals/rabbit-jump.png", {
      frameWidth: RABBIT_FRAME_WIDTH,
      frameHeight: RABBIT_FRAME_HEIGHT,
    });
    this.load.spritesheet("rabbit-sick", "/assets/pixel/animals/rabbit-sick.png", {
      frameWidth: RABBIT_FRAME_WIDTH,
      frameHeight: RABBIT_FRAME_HEIGHT,
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#5e9c48");
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawWorld();
    this.createTargets();
    this.createPlayer();
    this.targetRing = this.add.circle(0, 0, 38, 0xffdc67, 0.08).setStrokeStyle(4, 0xffdc67, 0.95).setDepth(18).setVisible(false);
    this.targetHint = this.add.text(0, -51, "먹기 대상", {
      fontFamily: "Arial, sans-serif", fontStyle: "bold", fontSize: "12px", color: "#fff7c2", backgroundColor: "#173d2cdd", padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(19).setVisible(false);
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key> | undefined;
    this.skillKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.skillKey?.on("down", () => this.activateSkill());
    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E).on("down", () => this.eatNearest());
    this.cameras.main.startFollow(this.player!, true, 0.13, 0.13);
    this.cameras.main.setZoom(1.08);
    this.options.onReady(this);
    this.emitStatus(0, true);
  }

  update(time: number, delta: number): void {
    if (!this.player) return;
    const keyboardX = (this.cursors?.left.isDown || this.wasd?.A?.isDown ? -1 : 0) + (this.cursors?.right.isDown || this.wasd?.D?.isDown ? 1 : 0);
    const keyboardY = (this.cursors?.up.isDown || this.wasd?.W?.isDown ? -1 : 0) + (this.cursors?.down.isDown || this.wasd?.S?.isDown ? 1 : 0);
    const rawX = keyboardX || keyboardY ? keyboardX : this.virtualInput.x;
    const rawY = keyboardX || keyboardY ? keyboardY : this.virtualInput.y;
    const length = Math.hypot(rawX, rawY);
    const inputX = length > 1 ? rawX / length : rawX;
    const inputY = length > 1 ? rawY / length : rawY;
    const species = SPECIES[this.speciesId];
    const skill = species.skill;
    const skillActive = time < this.skillActiveUntil;
    const movementLocked = Boolean(this.rabbitEatTween) || time < this.wrongUntil || skillActive && Boolean(skill && "movementLocked" in skill && skill.movementLocked);
    const moving = !movementLocked && Boolean(inputX || inputY);
    const speedMultiplier = skillActive && skill?.kind === "dash" ? skill.speedMultiplier ?? 1.3 : 1;

    if (moving) {
      this.facing = { x: inputX, y: inputY };
      const distance = species.baseSpeed * speedMultiplier * (delta / 1000);
      this.moveWithCollisions(inputX * distance, inputY * distance);
      this.hopPhase += delta * (skillActive ? 0.018 : 0.012);
    } else {
      this.hopPhase = 0;
    }

    this.updateVisual(time, moving, skillActive);
    this.hunger = Math.max(0, this.hunger - delta * 0.0007);
    this.updateEatTarget();
    this.emitStatus(time);
  }

  setSpecies(speciesId: string): void {
    if (!isPlayableSpeciesId(speciesId)) return;
    this.speciesId = speciesId;
    this.skillReadyAt = 0;
    this.skillActiveUntil = 0;
    this.eatReadyAt = 0;
    this.wrongUntil = 0;
    this.hunger = 100;
    this.score = 0;
    this.discoveredFoods.clear();
    this.stopRabbitAction();
    this.updateRoleVisual();
    this.burst(0xffe57a, `${SPECIES[speciesId].name} 역할`);
    this.emitStatus(this.time.now, true);
  }

  setVirtualInput(x: number, y: number): void {
    this.virtualInput = { x, y };
  }

  activateSkill(): void {
    if (!this.player || this.time.now < this.skillReadyAt) return;
    const skill = SPECIES[this.speciesId].skill;
    if (!skill) return;
    this.skillReadyAt = this.time.now + skill.cooldownMs;
    this.skillActiveUntil = this.time.now + skill.durationMs;
    if (skill.kind === "leap") {
      const distance = skill.dashDistance ?? 105;
      this.moveWithCollisions(this.facing.x * distance, this.facing.y * distance);
      this.tweens.add({ targets: [this.atlasSprite, this.rabbitSprite], y: -58, scaleY: 1.08, duration: skill.durationMs / 2, yoyo: true, ease: "Sine.easeOut" });
    }
    this.burst(skill.kind === "shield" ? 0x88dcff : skill.kind === "stealth" ? 0xb98cff : 0xffdf68, skill.name);
    this.emitStatus(this.time.now, true);
  }

  resetCooldown(): void {
    this.skillReadyAt = 0;
    this.skillActiveUntil = 0;
    this.burst(0x8dff9e, "쿨다운 초기화");
    this.emitStatus(this.time.now, true);
  }

  eatNearest(): void {
    if (!this.player || this.time.now < this.eatReadyAt || this.time.now < this.wrongUntil) return;
    this.playRabbitEatEffect();
    const target = this.nearestTarget();
    if (!target) {
      this.burst(0xff9e72, "먹이가 너무 멀어요");
      return;
    }
    this.eatReadyAt = this.time.now + EAT_COOLDOWN_MS;
    if (canEat(this.speciesId, target.speciesId)) {
      const firstDiscovery = !this.discoveredFoods.has(target.speciesId);
      this.discoveredFoods.add(target.speciesId);
      this.score = Math.round((this.score + (firstDiscovery ? 2 : 0.1)) * 10) / 10;
      this.hunger = Math.min(100, this.hunger + 28);
      target.active = false;
      target.visual.setVisible(false);
      this.time.delayedCall(4200, () => {
        target.active = true;
        target.visual.setVisible(true);
      });
      this.burst(0xffdf65, firstDiscovery ? "새 먹이 발견!" : "냠!");
    } else {
      this.wrongUntil = this.time.now + 2000;
      this.hunger = Math.max(0, this.hunger - 12);
      this.playRabbitSick(2000);
      this.burst(0xc783ff, "우욱… 먹이가 아니에요");
    }
    this.emitStatus(this.time.now, true);
  }

  private createPlayer(): void {
    const shadow = this.add.ellipse(0, 22, 58, 25, 0x153e2e, 0.38);
    this.playerRing = this.add.circle(0, 0, 36, 0xffffff, 0.05).setStrokeStyle(4, 0xffed80, 1);
    this.playerBody = this.add.circle(0, -3, 31, SPECIES[this.speciesId].color, 0.98).setStrokeStyle(4, 0x123629);
    this.atlasSprite = this.add.image(0, -7, "test-species-atlas");
    this.rabbitSprite = this.add.sprite(0, -18, "test-rabbit-jump", 0).setVisible(false);
    this.rabbitEffectRoot = this.add.container(0, 0, [this.rabbitSprite]);
    this.roleLabel = this.add.text(0, 45, "", {
      fontFamily: "Jua, sans-serif",
      fontSize: "17px",
      color: "#fff8d8",
      backgroundColor: "#12382ddd",
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5);
    this.stateLabel = this.add.text(0, -61, "", {
      fontFamily: "Jua, sans-serif",
      fontSize: "14px",
      color: "#fff6a9",
      stroke: "#17382d",
      strokeThickness: 5,
    }).setOrigin(0.5);
    this.player = this.add.container(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, [shadow, this.playerRing, this.playerBody, this.atlasSprite, this.rabbitEffectRoot, this.roleLabel, this.stateLabel]).setDepth(30);
    this.updateRoleVisual();
  }

  private updateRoleVisual(): void {
    if (!this.atlasSprite || !this.rabbitSprite || !this.playerBody || !this.roleLabel) return;
    const species = SPECIES[this.speciesId];
    this.playerBody.setFillStyle(species.color);
    this.roleLabel.setText(`${species.name} · ${species.skill?.name ?? "스킬 없음"}`);
    const rabbit = this.speciesId === "rabbit";
    this.rabbitSprite.setVisible(rabbit).setScale(0.27).setPosition(0, -22);
    this.atlasSprite.setVisible(!rabbit).setPosition(0, -7);
    if (rabbit && !this.rabbitAction) {
      this.rabbitSprite.setTexture("test-rabbit-jump", rabbitIdleFrame(this.facing.x, this.facing.y));
    }
    if (!rabbit) this.setAtlasSpecies(this.atlasSprite, this.speciesId, 68);
  }

  private updateVisual(time: number, moving: boolean, skillActive: boolean): void {
    if (!this.player || !this.playerRing || !this.playerBody || !this.atlasSprite || !this.rabbitSprite || !this.stateLabel) return;
    const skill = SPECIES[this.speciesId].skill;
    const directionRow = Math.floor(rabbitIdleFrame(this.facing.x, this.facing.y) / 4);
    const phase = moving ? Math.floor(this.hopPhase) % 4 : 0;
    if (!this.rabbitAction && !this.rabbitEatTween) this.rabbitSprite.setTexture("test-rabbit-jump", directionRow * 4 + phase);
    this.atlasSprite.setY(-7 + (moving ? Math.sin(this.hopPhase * Math.PI / 2) * 3 : 0));
    this.playerRing.setStrokeStyle(skillActive ? 7 : 4, skill?.kind === "shield" && skillActive ? 0x8edcff : 0xffed80, skillActive ? 1 : 0.85);
    const stealth = skillActive && skill?.kind === "stealth";
    this.player.setAlpha(stealth ? 0.32 : 1);
    this.playerBody.setScale(skillActive && skill?.kind === "shield" ? 1.25 : 1);
    const remaining = Math.max(0, this.skillReadyAt - time);
    this.stateLabel.setText(skillActive ? `${skill?.name} 발동!` : remaining > 0 ? `${Math.ceil(remaining / 1000)}초` : "");
  }

  private playRabbitEatEffect(): void {
    if (this.speciesId !== "rabbit" || !this.rabbitEffectRoot || this.rabbitAction === "sick") return;
    this.rabbitEatTween?.stop();
    this.rabbitEffectRoot.setPosition(0, 0).setAngle(0);
    const forwardX = this.facing.x * 5;
    const forwardY = this.facing.y * 5;
    const shakeX = -this.facing.y * 2;
    const shakeY = this.facing.x * 2;
    this.rabbitEatTween = this.tweens.add({
      targets: this.rabbitEffectRoot,
      x: forwardX,
      y: forwardY,
      duration: 70,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (!this.rabbitEffectRoot) return;
        this.rabbitEatTween = this.tweens.add({
          targets: this.rabbitEffectRoot,
          x: { from: forwardX - shakeX, to: forwardX + shakeX },
          y: { from: forwardY - shakeY, to: forwardY + shakeY },
          angle: { from: -2, to: 2 },
          duration: 40,
          yoyo: true,
          repeat: 1,
          ease: "Sine.easeInOut",
          onComplete: () => {
            if (!this.rabbitEffectRoot) return;
            this.rabbitEatTween = this.tweens.add({
              targets: this.rabbitEffectRoot,
              x: 0,
              y: 0,
              angle: 0,
              duration: 70,
              ease: "Cubic.easeIn",
              onComplete: () => {
                this.rabbitEffectRoot?.setPosition(0, 0).setAngle(0);
                this.rabbitEatTween = undefined;
              },
            });
          },
        });
      },
    });
  }

  private playRabbitSick(duration: number): void {
    if (this.speciesId !== "rabbit" || !this.rabbitSprite) return;
    this.stopRabbitAction(false);
    this.rabbitAction = "sick";
    this.rabbitSprite.setTexture("rabbit-sick", rabbitSickFrame(this.facing.x, this.facing.y));
    this.tweens.add({
      targets: this.rabbitSprite,
      x: { from: -3, to: 3 },
      angle: { from: -3, to: 3 },
      duration: 65,
      yoyo: true,
      repeat: Math.max(0, Math.ceil(duration / 130) - 1),
    });
    this.rabbitActionTimer = this.time.delayedCall(duration, () => this.stopRabbitAction());
  }

  private stopRabbitAction(restoreIdle = true): void {
    this.rabbitActionTimer?.remove(false);
    this.rabbitActionTimer = undefined;
    this.rabbitEatTween?.stop();
    this.rabbitEatTween = undefined;
    this.rabbitEffectRoot?.setPosition(0, 0).setAngle(0);
    if (!this.rabbitSprite) {
      this.rabbitAction = null;
      return;
    }
    this.rabbitSprite.stop();
    this.tweens.killTweensOf(this.rabbitSprite);
    this.rabbitSprite.setPosition(0, -22).setAngle(0);
    this.rabbitAction = null;
    if (restoreIdle && this.speciesId === "rabbit") {
      this.rabbitSprite.setTexture("test-rabbit-jump", rabbitIdleFrame(this.facing.x, this.facing.y));
    }
  }

  private moveWithCollisions(dx: number, dy: number): void {
    if (!this.player) return;
    const nextX = Phaser.Math.Clamp(this.player.x + dx, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
    if (!this.collides(nextX, this.player.y)) this.player.x = nextX;
    const nextY = Phaser.Math.Clamp(this.player.y + dy, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);
    if (!this.collides(this.player.x, nextY)) this.player.y = nextY;
  }

  private collides(x: number, y: number): boolean {
    return WORLD_OBSTACLES.some((rect) => x + PLAYER_RADIUS > rect.x && x - PLAYER_RADIUS < rect.x + rect.width && y + PLAYER_RADIUS > rect.y && y - PLAYER_RADIUS < rect.y + rect.height);
  }

  private createTargets(): void {
    PLANT_SPAWN_POINTS.slice(0, 32).forEach((point, index) => {
      const speciesId = index % 3 === 0 ? "berry" : "grass";
      this.targets.push(this.createTarget(`plant-${index}`, speciesId, point.x, point.y));
    });
    const animalSpecies = PLAYABLE_SPECIES.map((species) => species.id);
    SPAWN_POINTS.slice(0, 28).forEach((point, index) => {
      const speciesId = animalSpecies[index % animalSpecies.length]!;
      this.targets.push(this.createTarget(`animal-${index}`, speciesId, point.x, point.y));
    });
    const practiceRing: SpeciesId[] = ["grass", "berry", "grasshopper", "caterpillar", "frog", "rabbit", "squirrel", "bulbul", "duck", "snake"];
    practiceRing.forEach((speciesId, index) => {
      const angle = (Math.PI * 2 * index) / practiceRing.length;
      this.targets.push(this.createTarget(`practice-${index}`, speciesId, WORLD_WIDTH / 2 + Math.cos(angle) * 185, WORLD_HEIGHT / 2 + Math.sin(angle) * 185));
    });
  }

  private createTarget(id: string, speciesId: SpeciesId, x: number, y: number): TestTarget {
    let visual: Phaser.GameObjects.Container;
    if (speciesId === "grass" || speciesId === "berry") {
      const sprite = this.add.graphics();
      sprite.fillStyle(0x295f36, 0.45).fillRect(-18, 15, 38, 9);
      if (speciesId === "berry") {
        sprite.fillStyle(0x503724).fillRect(-4, -2, 9, 25);
        sprite.fillStyle(0x1f5933).fillRect(-17, -22, 36, 27);
        sprite.fillStyle(0x3f8445).fillRect(-12, -28, 25, 20);
        sprite.fillStyle(0xd65a4f).fillRect(-10, -17, 5, 5).fillRect(7, -12, 5, 5).fillRect(-1, -25, 5, 5);
      } else {
        sprite.fillStyle(0x2e733c).fillRect(-14, -7, 7, 26).fillRect(-3, -18, 7, 38).fillRect(8, -10, 7, 29);
        sprite.fillStyle(0x79ad4f).fillRect(-11, -3, 5, 14).fillRect(0, -14, 5, 18).fillRect(11, -6, 5, 16);
      }
      visual = this.add.container(x, y, [sprite]).setDepth(5);
    } else {
      const species = SPECIES[speciesId];
      const body = this.add.circle(0, 0, 23, species.color, 0.9).setStrokeStyle(3, 0xfff4b0);
      const image = this.add.image(0, -1, "test-species-atlas");
      this.setAtlasSpecies(image, speciesId, 44);
      const label = this.add.text(0, 34, "새끼", { fontSize: "11px", fontStyle: "bold", color: "#fff", backgroundColor: "#274f3dcc", padding: { x: 5, y: 2 } }).setOrigin(0.5);
      visual = this.add.container(x, y, [body, image, label]).setDepth(8);
    }
    return { id, speciesId, x, y, active: true, visual };
  }

  private nearestTarget(): TestTarget | undefined {
    if (!this.player) return undefined;
    const facingPoint = { x: this.player.x, y: this.player.y, facingX: this.facing.x, facingY: this.facing.y };
    return this.targets
      .filter((target) => target.active && Math.hypot(target.x - this.player!.x, target.y - this.player!.y) <= EAT_RANGE && isWithinEatReach(facingPoint, target))
      .sort((a, b) => Math.hypot(a.x - this.player!.x, a.y - this.player!.y) - Math.hypot(b.x - this.player!.x, b.y - this.player!.y))[0];
  }

  private updateEatTarget(): void {
    const target = this.nearestTarget();
    if (!target) {
      this.targetRing?.setVisible(false);
      this.targetHint?.setVisible(false);
      return;
    }
    this.targetRing?.setPosition(target.x, target.y).setVisible(true);
    this.targetHint?.setPosition(target.x, target.y - 51).setVisible(true);
  }

  private setAtlasSpecies(image: Phaser.GameObjects.Image, speciesId: string, size: number): void {
    const frames: Record<string, readonly [number, number]> = {
      grasshopper: [0, 0], caterpillar: [1, 0], rabbit: [2, 0], squirrel: [3, 0],
      frog: [0, 1], bulbul: [1, 1], duck: [2, 1], snake: [3, 1],
      weasel: [0, 2], hawk: [1, 2],
    };
    const [column, row] = frames[speciesId] ?? frames.grasshopper!;
    const texture = image.texture.getSourceImage() as HTMLImageElement;
    const cellWidth = texture.width / 4;
    const cellHeight = texture.height / 3;
    image.setCrop(column * cellWidth, row * cellHeight, cellWidth, cellHeight).setOrigin((column + 0.5) / 4, (row + 0.5) / 3).setScale(size / cellWidth, size / cellHeight);
  }

  private drawWorld(): void {
    const ground = this.add.graphics();
    ground.fillStyle(0x639f47).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    for (let x = 0; x < WORLD_WIDTH; x += 64) {
      for (let y = 0; y < WORLD_HEIGHT; y += 64) {
        if ((x / 64 + y / 64) % 3 === 0) ground.fillStyle(0x6aa64b, 0.48).fillRect(x, y, 64, 64);
        const seed = ((x * 17 + y * 31) >>> 3) % 43;
        if (seed % 4 === 0) ground.fillStyle(0x4f893b, 0.72).fillRect(x + 12 + seed, y + 18, 5, 9);
        if (seed % 7 === 0) ground.fillStyle(0x8cbd55, 0.85).fillRect(x + 38, y + 43, 7, 5);
      }
    }
    ground.fillStyle(0x9d8b52).fillRect(WORLD_WIDTH * 0.44 - 12, 0, WORLD_WIDTH * 0.12 + 24, WORLD_HEIGHT);
    ground.fillStyle(0xc1aa66).fillRect(WORLD_WIDTH * 0.44, 0, WORLD_WIDTH * 0.12, WORLD_HEIGHT);
    ground.fillStyle(0x9d8b52).fillRect(0, WORLD_HEIGHT * 0.44 - 12, WORLD_WIDTH, WORLD_HEIGHT * 0.12 + 24);
    ground.fillStyle(0xc1aa66).fillRect(0, WORLD_HEIGHT * 0.44, WORLD_WIDTH, WORLD_HEIGHT * 0.12);

    WORLD_OBSTACLES.forEach((rect, index) => {
      ground.fillStyle(0x183f2c).fillRect(rect.x - 8, rect.y + 10, rect.width + 16, rect.height + 10);
      ground.fillStyle(0x805c36).fillRect(rect.x - 5, rect.y - 5, rect.width + 10, rect.height + 10);
      ground.fillStyle(index % 2 ? 0x326a3d : 0x397746).fillRect(rect.x, rect.y, rect.width, rect.height);
      ground.fillStyle(0x70a34d).fillRect(rect.x + 8, rect.y + 8, rect.width - 16, 7);
      const treeCount = Math.max(2, Math.floor(rect.width / 55));
      for (let i = 0; i < treeCount; i += 1) this.drawTree(rect.x + 24 + i * 48, rect.y + 22 + (i % 2) * 38);
    });

    const landmarks = [
      [470, 170, "🌲 솔바람 숲"],
      [3820, 170, "🌼 들꽃 언덕"],
      [420, 2740, "🪨 바위 골짜기"],
      [3820, 2740, "💧 물빛 쉼터"],
      [2190, 1370, "🧭 만남의 광장"],
    ] as const;
    landmarks.forEach(([x, y, label]) => this.add.text(x, y, label, { fontFamily: "Arial Rounded MT Bold, sans-serif", fontSize: "28px", color: "#fffbe8", stroke: "#295b3b", strokeThickness: 7 }).setDepth(2));
  }

  private drawTree(x: number, y: number): void {
    const tree = this.add.graphics().setPosition(x, y).setDepth(5);
    tree.fillStyle(0x503724).fillRect(-5, 20, 11, 18);
    tree.fillStyle(0x173f2a).fillRect(-22, -2, 44, 30);
    tree.fillStyle(0x3b7a43).fillRect(-16, -16, 33, 31);
    tree.fillStyle(0x77a94e).fillRect(-8, -13, 9, 8);
  }

  private burst(color: number, copy: string): void {
    if (!this.player) return;
    const ring = this.add.circle(this.player.x, this.player.y, 34, color, 0.12).setStrokeStyle(6, color, 0.95).setDepth(45);
    const text = this.add.text(this.player.x, this.player.y - 68, copy, { fontFamily: "Jua, sans-serif", fontSize: "22px", color: "#fff8c7", stroke: "#17382d", strokeThickness: 6 }).setOrigin(0.5).setDepth(46);
    this.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 520, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
    this.tweens.add({ targets: text, y: text.y - 45, alpha: 0, duration: 760, ease: "Cubic.easeOut", onComplete: () => text.destroy() });
  }

  private emitStatus(time: number, force = false): void {
    if (!this.player || (!force && time - this.lastStatusAt < 100)) return;
    this.lastStatusAt = time;
    const species = SPECIES[this.speciesId];
    this.options.onStatus({
      speciesId: this.speciesId,
      skillName: species.skill?.name ?? "스킬 없음",
      cooldownRemainingMs: Math.max(0, this.skillReadyAt - time),
      activeRemainingMs: Math.max(0, this.skillActiveUntil - time),
      eatRemainingMs: Math.max(0, this.eatReadyAt - time),
      wrongRemainingMs: Math.max(0, this.wrongUntil - time),
      hunger: this.hunger,
      score: this.score,
      discovered: this.discoveredFoods.size,
      totalRelations: foodsFor(this.speciesId).length,
      timeRemainingMs: Math.max(0, 5 * 60 * 1000 - time),
      position: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
    });
  }
}

export const TESTABLE_ROLES = PLAYABLE_SPECIES;
