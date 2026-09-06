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
  canSeeThroughCover,
  isPlayableSpeciesId,
  isGameModeId,
  isSpeciesId,
  modeConfig,
  isWithinEatReach,
  type GameModeId,
  type PlayableSpeciesId,
  type SpeciesId,
} from "@feed-chain/shared";
import {
  SPECIES_FRAME_HEIGHT,
  SPECIES_FRAME_WIDTH,
  SPECIES_SPRITE_SCALE,
  SNATCH_DURATION_MS,
  SNATCH_FRAME_RATE,
  SPRITE_DIRECTIONS,
  SPRITE_SPECIES,
  hasSickSprite,
  hasSnatchSprite,
  isFlyingSpriteSpecies,
  isSpriteSpecies,
  movementFrame,
  movementTextureKey,
  sickFrame,
  sickTextureKey,
  snatchAnimationKey,
  snatchTextureKey,
  speciesSnatchDrop,
  speciesSpriteScale,
  spriteDirection,
  spriteDirectionRow,
  speciesSpriteY,
  speciesSpriteConfig,
} from "./speciesAnimations";
import {
  PLANT_FRAME_HEIGHT,
  PLANT_FRAME_WIDTH,
  PLANT_SPECIES,
  createPlantVisual,
  isPlantSpriteSpecies,
  plantSpriteConfig,
  plantTextureKey,
} from "./plantSprites";
import { createWorldTileBackground, preloadWorldTiles } from "./worldBackground";
import { createWorldBushes, preloadWorldBush, updateWorldBushes, type WorldBushVisualMap } from "./worldCover";

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
  populationCount: number;
  status: "active" | "respawning" | "ghost" | "extinct";
  modeId: GameModeId;
  modeNumber: number;
  modeTitle: string;
}

interface GameTestSceneOptions {
  initialSpeciesId: PlayableSpeciesId;
  initialModeId: GameModeId;
  initialRemovedSpecies?: SpeciesId;
  onReady: (scene: GameTestScene) => void;
  onStatus: (status: GameTestStatus) => void;
}

export class GameTestScene extends Phaser.Scene {
  private readonly options: GameTestSceneOptions;
  private speciesId: PlayableSpeciesId;
  private modeId: GameModeId;
  private removedSpecies?: SpeciesId;
  private player?: Phaser.GameObjects.Container;
  private atlasSprite?: Phaser.GameObjects.Image;
  private speciesSprite?: Phaser.GameObjects.Sprite;
  private populationLabel?: Phaser.GameObjects.Text;
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
  private bushes: WorldBushVisualMap = new Map();
  private targetRing?: Phaser.GameObjects.Arc;
  private eatReadyAt = 0;
  private wrongUntil = 0;
  private hunger = 100;
  private score = 0;
  private discoveredFoods = new Set<SpeciesId>();
  private speciesAction: "sick" | "snatch" | null = null;
  private speciesActionTimer?: Phaser.Time.TimerEvent;
  private populationCount = 1;
  private playerStatus: GameTestStatus["status"] = "active";
  private modeStartedAt = 0;

  constructor(options: GameTestSceneOptions) {
    super("game-test");
    this.options = options;
    this.speciesId = options.initialSpeciesId;
    this.modeId = options.initialModeId;
    this.removedSpecies = options.initialRemovedSpecies;
  }

  preload(): void {
    this.load.image("test-species-atlas", "/assets/pixel/species-atlas.png");
    preloadWorldTiles(this, "test-");
    preloadWorldBush(this, "test-");
    SPRITE_SPECIES.forEach((speciesId) => {
      const config = speciesSpriteConfig(speciesId);
      this.load.spritesheet(movementTextureKey(speciesId, "test-"), `/assets/pixel/animals/${config.movementFile}`, {
        frameWidth: SPECIES_FRAME_WIDTH,
        frameHeight: SPECIES_FRAME_HEIGHT,
      });
      if (config.sickFile) {
        this.load.spritesheet(sickTextureKey(speciesId, "test-"), `/assets/pixel/animals/${config.sickFile}`, {
          frameWidth: SPECIES_FRAME_WIDTH,
          frameHeight: SPECIES_FRAME_HEIGHT,
        });
      }
      if (config.snatchFile) {
        this.load.spritesheet(snatchTextureKey(speciesId, "test-"), `/assets/pixel/animals/${config.snatchFile}`, {
          frameWidth: SPECIES_FRAME_WIDTH,
          frameHeight: SPECIES_FRAME_HEIGHT,
        });
      }
    });
    PLANT_SPECIES.forEach((speciesId) => {
      const config = plantSpriteConfig(speciesId);
      this.load.spritesheet(plantTextureKey(speciesId, "test-"), `/assets/pixel/plants/${config.file}`, {
        frameWidth: PLANT_FRAME_WIDTH,
        frameHeight: PLANT_FRAME_HEIGHT,
      });
    });
  }

  create(): void {
    this.createSpeciesAnimations();
    this.cameras.main.setBackgroundColor("#5e9c48");
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawWorld();
    this.createTargets();
    this.createPlayer();
    this.targetRing = this.add.circle(0, 0, 38, 0xffdc67, 0.08).setStrokeStyle(4, 0xffdc67, 0.95).setDepth(18).setVisible(false);
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key> | undefined;
    this.skillKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.skillKey?.on("down", () => this.activateSkill());
    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E).on("down", () => this.eatNearest());
    this.cameras.main.startFollow(this.player!, true, 0.13, 0.13);
    this.cameras.main.setZoom(1.08);
    this.options.onReady(this);
    this.modeStartedAt = this.time.now;
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
    const movementLocked = time < this.wrongUntil || skillActive && Boolean(skill && "movementLocked" in skill && skill.movementLocked);
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
    updateWorldBushes(this.bushes, this.player.x, this.player.y);
    this.updateTargetVisibility();
    this.updateEatTarget();
    this.emitStatus(time);
  }

  setSpecies(speciesId: string): void {
    if (!isPlayableSpeciesId(speciesId)) return;
    const mode = modeConfig(this.modeId, this.removedSpecies);
    if (!mode.playableSpecies.includes(speciesId)) return;
    this.speciesId = speciesId;
    this.skillReadyAt = 0;
    this.skillActiveUntil = 0;
    this.eatReadyAt = 0;
    this.wrongUntil = 0;
    this.hunger = 100;
    this.score = 0;
    this.populationCount = 1;
    this.playerStatus = "active";
    this.discoveredFoods.clear();
    this.targets.forEach((target) => { target.active = true; target.visual.setVisible(true); });
    this.stopSpeciesAction();
    this.updateRoleVisual();
    this.burst(0xffe57a, `${SPECIES[speciesId].name} 역할`);
    this.emitStatus(this.time.now, true);
  }

  setMode(modeId: string, removedSpecies?: string): void {
    if (!isGameModeId(modeId)) return;
    this.modeId = modeId;
    this.removedSpecies = removedSpecies && isSpeciesId(removedSpecies) ? removedSpecies : modeId === "web_removal" ? "frog" : undefined;
    const mode = modeConfig(this.modeId, this.removedSpecies);
    if (!mode.playableSpecies.includes(this.speciesId)) {
      this.speciesId = mode.playableSpecies[0] ?? "hawk";
    }
    this.modeStartedAt = this.time.now;
    this.skillReadyAt = 0;
    this.skillActiveUntil = 0;
    this.eatReadyAt = 0;
    this.wrongUntil = 0;
    this.hunger = 100;
    this.score = 0;
    this.discoveredFoods.clear();
    this.stopSpeciesAction();
    this.populationCount = 1;
    this.playerStatus = "active";
    this.burst(0xffe57a, `${mode.number}번 게임`);
    this.emitStatus(this.time.now, true);
  }

  setVirtualInput(x: number, y: number): void {
    this.virtualInput = { x, y };
  }

  activateSkill(): void {
    if (!this.player || this.time.now < this.skillReadyAt || this.speciesAction === "snatch") return;
    const skill = SPECIES[this.speciesId].skill;
    if (!skill) return;
    this.skillReadyAt = this.time.now + skill.cooldownMs;
    this.skillActiveUntil = this.time.now + skill.durationMs;
    if (skill.kind === "leap") {
      const distance = skill.dashDistance ?? 105;
      this.moveWithCollisions(this.facing.x * distance, this.facing.y * distance);
      this.tweens.add({ targets: [this.atlasSprite, this.speciesSprite], y: -58, scaleY: 1.08, duration: skill.durationMs / 2, yoyo: true, ease: "Sine.easeOut" });
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
    if (!this.player || this.time.now < this.eatReadyAt || this.time.now < this.wrongUntil || this.speciesAction === "snatch") return;
    this.playSpeciesSnatch();
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
      this.populationCount = Math.min(99, this.populationCount + 1);
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
      this.playSpeciesSick(2000);
      this.burst(0xc783ff, "우욱… 먹이가 아니에요");
    }
    this.emitStatus(this.time.now, true);
  }

  private createPlayer(): void {
    const shadow = this.add.ellipse(0, 22, 58, 25, 0x153e2e, 0.38);
    this.atlasSprite = this.add.image(0, -7, "test-species-atlas");
    this.speciesSprite = this.add.sprite(0, -18, movementTextureKey("rabbit", "test-"), 0).setVisible(false);
    this.populationLabel = this.add.text(0, -52, "X1", {
      fontFamily: "Mona12, sans-serif",
      fontSize: "12px",
      color: "#fff2a4",
      backgroundColor: "#173d2de8",
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5);
    this.stateLabel = this.add.text(0, -72, "", {
      fontFamily: "Mona12, sans-serif",
      fontSize: "10px",
      color: "#fff6a9",
      stroke: "#17382d",
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.player = this.add.container(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, [shadow, this.atlasSprite, this.speciesSprite, this.populationLabel, this.stateLabel]).setDepth(30);
    this.updateRoleVisual();
  }

  private updateRoleVisual(): void {
    if (!this.atlasSprite || !this.speciesSprite) return;
    const spriteSpeciesId = isSpriteSpecies(this.speciesId) ? this.speciesId : null;
    const spriteY = spriteSpeciesId ? speciesSpriteY(spriteSpeciesId, -22) : -22;
    this.speciesSprite
      .setVisible(Boolean(spriteSpeciesId))
      .setScale(spriteSpeciesId ? speciesSpriteScale(spriteSpeciesId) : SPECIES_SPRITE_SCALE)
      .setPosition(0, spriteY);
    this.atlasSprite.setVisible(!spriteSpeciesId).setPosition(0, -7);
    if (spriteSpeciesId && !this.speciesAction) {
      this.speciesSprite.setTexture(
        movementTextureKey(spriteSpeciesId, "test-"),
        movementFrame(this.facing.x, this.facing.y),
      );
    }
    if (!spriteSpeciesId) this.setAtlasSpecies(this.atlasSprite, this.speciesId, 68);
  }

  private updateVisual(time: number, moving: boolean, skillActive: boolean): void {
    if (!this.player || !this.atlasSprite || !this.speciesSprite || !this.populationLabel || !this.stateLabel) return;
    const skill = SPECIES[this.speciesId].skill;
    const flying = isFlyingSpriteSpecies(this.speciesId);
    const phase = flying ? Math.floor(this.time.now / 110) % 4 : moving ? Math.floor(this.hopPhase) % 4 : 0;
    if (isSpriteSpecies(this.speciesId) && !this.speciesAction) {
      const hover = flying ? Math.sin(time / 170) * 2 : 0;
      this.speciesSprite.setY(speciesSpriteY(this.speciesId, -22) + hover);
      this.speciesSprite.setTexture(
        movementTextureKey(this.speciesId, "test-"),
        movementFrame(this.facing.x, this.facing.y, phase),
      );
    }
    this.atlasSprite.setY(-7 + (moving ? Math.sin(this.hopPhase * Math.PI / 2) * 3 : 0));
    const stealth = skillActive && skill?.kind === "stealth";
    this.player.setAlpha(stealth ? 0.32 : 1);
    this.populationLabel.setText(`X${this.populationCount}`);
    const remaining = Math.max(0, this.skillReadyAt - time);
    this.stateLabel.setText(skillActive ? `${skill?.name} 발동!` : remaining > 0 ? `${Math.ceil(remaining / 1000)}초` : "");
  }

  private playSpeciesSick(duration: number): void {
    if (!isSpriteSpecies(this.speciesId) || !hasSickSprite(this.speciesId) || !this.speciesSprite) return;
    this.stopSpeciesAction(false);
    this.speciesAction = "sick";
    this.speciesSprite.setTexture(
      sickTextureKey(this.speciesId, "test-"),
      sickFrame(this.facing.x, this.facing.y),
    );
    this.tweens.add({
      targets: this.speciesSprite,
      x: { from: -3, to: 3 },
      angle: { from: -3, to: 3 },
      duration: 65,
      yoyo: true,
      repeat: Math.max(0, Math.ceil(duration / 130) - 1),
    });
    this.speciesActionTimer = this.time.delayedCall(duration, () => this.stopSpeciesAction());
  }

  private playSpeciesSnatch(): void {
    if (!isSpriteSpecies(this.speciesId) || !hasSnatchSprite(this.speciesId) || !this.speciesSprite) return;
    this.stopSpeciesAction(false);
    this.speciesAction = "snatch";
    const baseY = speciesSpriteY(this.speciesId, -22);
    this.speciesSprite.setPosition(0, baseY).setAngle(0);
    this.speciesSprite.play(snatchAnimationKey(this.speciesId, spriteDirection(this.facing.x, this.facing.y), "test-"));
    this.tweens.add({
      targets: this.speciesSprite,
      y: baseY + speciesSnatchDrop(this.speciesId),
      duration: SNATCH_DURATION_MS / 2,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
    this.speciesActionTimer = this.time.delayedCall(SNATCH_DURATION_MS, () => this.stopSpeciesAction());
  }

  private createSpeciesAnimations(): void {
    SPRITE_SPECIES.forEach((speciesId) => {
      if (!hasSnatchSprite(speciesId)) return;
      SPRITE_DIRECTIONS.forEach((direction) => {
        const key = snatchAnimationKey(speciesId, direction, "test-");
        if (this.anims.exists(key)) return;
        const start = spriteDirectionRow(direction === "left" ? -1 : direction === "right" ? 1 : 0, direction === "up" ? -1 : direction === "down" ? 1 : 0) * 4;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(snatchTextureKey(speciesId, "test-"), { start, end: start + 3 }),
          frameRate: SNATCH_FRAME_RATE,
          repeat: 0,
        });
      });
    });
  }

  private stopSpeciesAction(restoreIdle = true): void {
    this.speciesActionTimer?.remove(false);
    this.speciesActionTimer = undefined;
    if (!this.speciesSprite) {
      this.speciesAction = null;
      return;
    }
    this.speciesSprite.stop();
    this.tweens.killTweensOf(this.speciesSprite);
    const y = isSpriteSpecies(this.speciesId) ? speciesSpriteY(this.speciesId, -22) : -22;
    this.speciesSprite.setPosition(0, y).setAngle(0);
    this.speciesAction = null;
    if (restoreIdle && isSpriteSpecies(this.speciesId)) {
      this.speciesSprite.setTexture(
        movementTextureKey(this.speciesId, "test-"),
        movementFrame(this.facing.x, this.facing.y),
      );
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
      const speciesId: SpeciesId = (index % 4 === 0 ? "berry" : index % 4 === 1 ? "acorn" : index % 4 === 2 ? "clover" : "grass");
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
    if (isPlantSpriteSpecies(speciesId)) {
      visual = createPlantVisual(this, speciesId, x, y, "test-");
    } else {
      const image = this.add.image(0, -1, "test-species-atlas");
      this.setAtlasSpecies(image, speciesId, 44);
      const population = this.add.text(0, -31, "X1", { fontFamily: "Mona12, sans-serif", fontSize: "9px", color: "#fff2a4", backgroundColor: "#173d2de8", padding: { x: 3, y: 2 } }).setOrigin(0.5);
      visual = this.add.container(x, y, [image, population]).setDepth(8);
    }
    return { id, speciesId, x, y, active: true, visual };
  }

  private nearestTarget(): TestTarget | undefined {
    if (!this.player) return undefined;
    const facingPoint = { x: this.player.x, y: this.player.y, facingX: this.facing.x, facingY: this.facing.y };
    const config = modeConfig(this.modeId, this.removedSpecies);
    return this.targets
      .filter((target) => target.active && config.activeSpecies.includes(target.speciesId) && Math.hypot(target.x - this.player!.x, target.y - this.player!.y) <= EAT_RANGE && isWithinEatReach(facingPoint, target))
      .filter((target) => isPlantSpriteSpecies(target.speciesId) || canSeeThroughCover(this.player!.x, this.player!.y, target.x, target.y))
      .sort((a, b) => Math.hypot(a.x - this.player!.x, a.y - this.player!.y) - Math.hypot(b.x - this.player!.x, b.y - this.player!.y))[0];
  }

  private updateTargetVisibility(): void {
    if (!this.player) return;
    this.targets.forEach((target) => {
      const visible = isPlantSpriteSpecies(target.speciesId) || canSeeThroughCover(this.player!.x, this.player!.y, target.x, target.y);
      target.visual.setVisible(target.active && visible);
    });
  }

  private updateEatTarget(): void {
    const target = this.nearestTarget();
    if (!target) {
      this.targetRing?.setVisible(false);
      return;
    }
    this.targetRing?.setPosition(target.x, target.y).setVisible(true);
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
    createWorldTileBackground(this, "test-");
    const ground = this.add.graphics().setDepth(5);

    WORLD_OBSTACLES.forEach((rect, index) => {
      ground.fillStyle(0x183f2c).fillRect(rect.x - 8, rect.y + 10, rect.width + 16, rect.height + 10);
      ground.fillStyle(0x805c36).fillRect(rect.x - 5, rect.y - 5, rect.width + 10, rect.height + 10);
      ground.fillStyle(index % 2 ? 0x326a3d : 0x397746).fillRect(rect.x, rect.y, rect.width, rect.height);
      ground.fillStyle(0x70a34d).fillRect(rect.x + 8, rect.y + 8, rect.width - 16, 7);
      const treeCount = Math.max(2, Math.floor(rect.width / 55));
      for (let i = 0; i < treeCount; i += 1) this.drawTree(rect.x + 24 + i * 48, rect.y + 22 + (i % 2) * 38);
    });

    this.bushes = createWorldBushes(this, "test-");

    const landmarks = [
      [470, 170, "솔바람 숲"],
      [3820, 170, "들꽃 언덕"],
      [420, 2740, "바위 골짜기"],
      [3820, 2740, "물빛 쉼터"],
      [2190, 1370, "만남의 광장"],
    ] as const;
    landmarks.forEach(([x, y, label]) => this.add.text(x, y, label, { fontFamily: "Mona12, sans-serif", fontSize: "28px", color: "#fffbe8", stroke: "#295b3b", strokeThickness: 7 }).setDepth(7));
  }

  private drawTree(x: number, y: number): void {
    const tree = this.add.graphics().setPosition(x, y).setDepth(6);
    tree.fillStyle(0x503724).fillRect(-5, 20, 11, 18);
    tree.fillStyle(0x173f2a).fillRect(-22, -2, 44, 30);
    tree.fillStyle(0x3b7a43).fillRect(-16, -16, 33, 31);
    tree.fillStyle(0x77a94e).fillRect(-8, -13, 9, 8);
  }

  private burst(_color: number, copy: string): void {
    if (!this.player) return;
    const text = this.add.text(this.player.x, this.player.y - 68, copy, { fontFamily: "Mona12, sans-serif", fontSize: "22px", color: "#fff8c7", stroke: "#17382d", strokeThickness: 6 }).setOrigin(0.5).setDepth(46);
    this.tweens.add({ targets: text, y: text.y - 45, alpha: 0, duration: 760, ease: "Cubic.easeOut", onComplete: () => text.destroy() });
  }

  private emitStatus(time: number, force = false): void {
    if (!this.player || (!force && time - this.lastStatusAt < 100)) return;
    this.lastStatusAt = time;
    const species = SPECIES[this.speciesId];
    const config = modeConfig(this.modeId, this.removedSpecies);
    const elapsed = Math.max(0, time - this.modeStartedAt);
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
      totalRelations: config.relations.filter((edge) => edge.predator === this.speciesId).length,
      timeRemainingMs: Math.max(0, config.durationMs - elapsed),
      position: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
      populationCount: this.populationCount,
      status: this.playerStatus,
      modeId: this.modeId,
      modeNumber: config.number,
      modeTitle: config.title,
    });
  }
}

export const TESTABLE_ROLES = PLAYABLE_SPECIES;
