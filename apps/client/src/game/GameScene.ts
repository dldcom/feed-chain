import Phaser from "phaser";
import {
  EAT_RANGE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  canSeeThroughCover,
  isGameModeId,
  modeConfig,
  isSpeciesId,
  isWithinEatReach,
  shrinkBounds,
} from "@feed-chain/shared";
import { movementLogicPose, movementRenderPose, tickMovementNetcode } from "../network/movementNetcode";
import { useGameStore } from "../store/gameStore";
import type { AnimalSnapshot, PlantSnapshot, PlayerSnapshot } from "../types";
import {
  SPECIES_FRAME_HEIGHT,
  SPECIES_FRAME_WIDTH,
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
  plantSpriteConfig,
  plantTextureKey,
} from "./plantSprites";
import { createWorldTileBackground, preloadWorldTiles } from "./worldBackground";
import { createWorldBushes, preloadWorldBush, updateWorldBushes, type WorldBushVisualMap } from "./worldCover";

interface PlayerVisual {
  container: Phaser.GameObjects.Container;
  emoji: Phaser.GameObjects.Image;
  speciesSprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  population: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  speciesId: string;
  speciesAction: "sick" | "snatch" | null;
  speciesActionTimer?: Phaser.Time.TimerEvent;
}

interface AnimalVisual {
  container: Phaser.GameObjects.Container;
  emoji: Phaser.GameObjects.Image;
  speciesSprite: Phaser.GameObjects.Sprite;
  population: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  speciesId: string;
  facingX: number;
  facingY: number;
}

export class GameScene extends Phaser.Scene {
  private players = new Map<string, PlayerVisual>();
  private plants = new Map<string, Phaser.GameObjects.Container>();
  private animals = new Map<string, AnimalVisual>();
  private bushes: WorldBushVisualMap = new Map();
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<string, Phaser.Input.Keyboard.Key>;
  private boundary?: Phaser.GameObjects.Graphics;
  private lastShrinkStage = -1;
  private targetRing?: Phaser.GameObjects.Arc;
  private lastEffectId = 0;

  constructor() {
    super("ecosystem");
  }

  preload(): void {
    this.load.image("species-atlas", "/assets/pixel/species-atlas.png");
    preloadWorldTiles(this);
    preloadWorldBush(this);
    SPRITE_SPECIES.forEach((speciesId) => {
      const config = speciesSpriteConfig(speciesId);
      this.load.spritesheet(movementTextureKey(speciesId), `/assets/pixel/animals/${config.movementFile}`, {
        frameWidth: SPECIES_FRAME_WIDTH,
        frameHeight: SPECIES_FRAME_HEIGHT,
      });
      if (config.sickFile) {
        this.load.spritesheet(sickTextureKey(speciesId), `/assets/pixel/animals/${config.sickFile}`, {
          frameWidth: SPECIES_FRAME_WIDTH,
          frameHeight: SPECIES_FRAME_HEIGHT,
        });
      }
      if (config.snatchFile) {
        this.load.spritesheet(snatchTextureKey(speciesId), `/assets/pixel/animals/${config.snatchFile}`, {
          frameWidth: SPECIES_FRAME_WIDTH,
          frameHeight: SPECIES_FRAME_HEIGHT,
        });
      }
    });
    PLANT_SPECIES.forEach((speciesId) => {
      const config = plantSpriteConfig(speciesId);
      this.load.spritesheet(plantTextureKey(speciesId), `/assets/pixel/plants/${config.file}`, {
        frameWidth: PLANT_FRAME_WIDTH,
        frameHeight: PLANT_FRAME_HEIGHT,
      });
    });
  }

  create(): void {
    this.createSpeciesAnimations();
    this.cameras.main.setBackgroundColor("#83c867");
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawWorld();
    this.targetRing = this.add.circle(0, 0, 38, 0xffdc67, 0.08).setStrokeStyle(4, 0xffdc67, 0.95).setDepth(18).setVisible(false);
    this.boundary = this.add.graphics().setDepth(4);
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key> | undefined;
  }

  update(time: number): void {
    const state = useGameStore.getState();
    const keyboardX = (this.cursors?.left.isDown || this.wasd?.A?.isDown ? -1 : 0) + (this.cursors?.right.isDown || this.wasd?.D?.isDown ? 1 : 0);
    const keyboardY = (this.cursors?.up.isDown || this.wasd?.W?.isDown ? -1 : 0) + (this.cursors?.down.isDown || this.wasd?.S?.isDown ? 1 : 0);
    const input = keyboardX || keyboardY ? { x: keyboardX, y: keyboardY } : state.input;
    const length = Math.hypot(input.x, input.y);
    const moveX = length > 1 ? input.x / length : input.x;
    const moveY = length > 1 ? input.y / length : input.y;
    tickMovementNetcode(time, moveX, moveY);

    const self = state.snapshot.players.find((player) => player.id === state.selfId);
    const viewerPose = self ? movementLogicPose(state.selfId) ?? self : undefined;
    const viewerX = viewerPose?.x ?? self?.x ?? WORLD_WIDTH / 2;
    const viewerY = viewerPose?.y ?? self?.y ?? WORLD_HEIGHT / 2;
    updateWorldBushes(this.bushes, viewerX, viewerY);

    this.syncPlayers(state.snapshot.players, state.selfId, viewerX, viewerY);
    this.syncPlants(state.snapshot.plants);
    this.syncAnimals(state.snapshot.animals, viewerX, viewerY);
    this.syncEatTarget(state.snapshot.players, state.snapshot.plants, state.snapshot.animals, state.selfId, viewerX, viewerY);
    if (state.effect && state.effect.id !== this.lastEffectId) {
      this.lastEffectId = state.effect.id;
      this.playActionEffect(state.effect.kind, state.effect.actorId, state.effect.targetId, state.effect.delta);
    }
    this.drawShrinkBoundary(state.snapshot.shrinkStage);
    if (!state.selfId || !state.snapshot.players.some((player) => player.id === state.selfId)) {
      this.cameras.main.stopFollow();
      this.cameras.main.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
      this.cameras.main.setZoom(Math.min(this.scale.width / WORLD_WIDTH, this.scale.height / WORLD_HEIGHT) * 0.94);
    } else {
      this.cameras.main.setZoom(1);
    }

    this.players.forEach((visual) => {
      visual.container.x = visual.targetX;
      visual.container.y = visual.targetY;
    });
  }

  private drawWorld(): void {
    createWorldTileBackground(this);
    this.bushes = createWorldBushes(this);

    const landmarks = [
      { x: 470, y: 170, name: "솔바람 숲" },
      { x: 3820, y: 170, name: "들꽃 언덕" },
      { x: 420, y: 2740, name: "바위 골짜기" },
      { x: 3820, y: 2740, name: "물빛 쉼터" },
      { x: 2190, y: 1370, name: "만남의 광장" },
    ];
    landmarks.forEach(({ x, y, name }) => {
      this.add.text(x, y, name, {
        fontFamily: "Mona12, sans-serif",
        fontSize: "28px",
        color: "#fffbe8",
        stroke: "#295b3b",
        strokeThickness: 7,
      }).setDepth(7);
    });
  }

  private syncPlayers(players: PlayerSnapshot[], selfId: string, viewerX: number, viewerY: number): void {
    const ids = new Set(players.map((player) => player.id));
    this.players.forEach((visual, id) => {
      if (!ids.has(id)) {
        this.stopSpeciesAction(visual, false);
        visual.container.destroy(true);
        this.players.delete(id);
      }
    });

    players.forEach((player) => {
      const renderPosition = movementRenderPose(player.id) ?? player;
      let visual = this.players.get(player.id);
      if (!visual) {
        const emoji = this.add.image(0, -2, "species-atlas");
        this.setSpeciesSprite(emoji, player.species, 54);
        const speciesSprite = this.add.sprite(0, -18, movementTextureKey("rabbit"), movementFrame(player.facingX, player.facingY)).setScale(speciesSpriteScale("rabbit")).setVisible(false);
        const label = this.add.text(0, -70, player.name, {
          fontFamily: "Mona12, sans-serif",
          fontSize: "10px",
          color: "#fff8d8",
          stroke: "#173d2c",
          strokeThickness: 3,
        }).setOrigin(0.5);
        const population = this.add.text(0, -52, "X1", {
          fontFamily: "Mona12, sans-serif",
          fontSize: "12px",
          color: "#fff2a4",
          backgroundColor: "#173d2de8",
          padding: { x: 5, y: 2 },
        }).setOrigin(0.5);
        const status = this.add.text(0, -88, "", { fontFamily: "Mona12, sans-serif", fontSize: "10px", color: "#fff8d8", stroke: "#173d2c", strokeThickness: 3 }).setOrigin(0.5);
        const container = this.add.container(renderPosition.x, renderPosition.y, [emoji, speciesSprite, label, population, status]).setDepth(player.id === selfId ? 20 : 10);
        visual = {
          container, emoji, speciesSprite, label, population, status,
          targetX: renderPosition.x, targetY: renderPosition.y,
          speciesId: player.species, speciesAction: null,
        };
        this.players.set(player.id, visual);
        if (player.id === selfId) this.cameras.main.startFollow(container, true, 0.3, 0.3);
      }
      const moving = Math.hypot(renderPosition.x - visual.targetX, renderPosition.y - visual.targetY) > 0.05;
      visual.targetX = renderPosition.x;
      visual.targetY = renderPosition.y;
      visual.label.setText(player.name);
      visual.population.setText(`X${Math.max(0, player.populationCount)}`);
      this.updatePlayerSpeciesVisual(visual, player.species, renderPosition.facingX, renderPosition.facingY, moving);
      visual.container.setAlpha(player.status === "ghost" || player.status === "respawning" ? 0.45 : player.status === "extinct" ? 0.2 : player.stealth ? 0.25 : 1);
      visual.container.setScale(player.shielded ? 0.82 : 1);
      visual.container.setVisible(
        player.id === selfId || canSeeThroughCover(viewerX, viewerY, renderPosition.x, renderPosition.y),
      );
      visual.status.setText(player.wrongUntil > Date.now() ? "배탈" : player.shielded ? "방어" : player.escapeUntil > Date.now() ? "탈출" : player.status === "respawning" ? "재등장" : player.status === "ghost" ? "관찰자" : player.status === "extinct" ? "관찰 중" : "");
      if (isSpriteSpecies(player.species) && hasSickSprite(player.species) && player.wrongUntil > Date.now()) {
        if (visual.speciesAction !== "sick") this.playSpeciesSick(visual, player.species, renderPosition.facingX, renderPosition.facingY, player.wrongUntil - Date.now());
      } else if (visual.speciesAction === "sick") {
        this.stopSpeciesAction(visual);
      }
    });
  }

  private syncPlants(plants: PlantSnapshot[]): void {
    const ids = new Set(plants.map((plant) => plant.id));
    this.plants.forEach((container, id) => {
      if (!ids.has(id)) {
        container.destroy(true);
        this.plants.delete(id);
      }
    });
    plants.forEach((plant) => {
      let container = this.plants.get(plant.id);
      if (container && container.getData("species") !== plant.species) {
        container.destroy(true);
        this.plants.delete(plant.id);
        container = undefined;
      }
      if (!container) {
        container = createPlantVisual(this, plant.species, plant.x, plant.y);
        this.plants.set(plant.id, container);
      }
      container.setPosition(plant.x, plant.y);
      container.setVisible(plant.active);
    });
  }

  private syncAnimals(animals: AnimalSnapshot[], viewerX: number, viewerY: number): void {
    const ids = new Set(animals.map((animal) => animal.id));
    this.animals.forEach((visual, id) => {
      if (!ids.has(id)) {
        visual.container.destroy(true);
        this.animals.delete(id);
      }
    });
    animals.forEach((animal) => {
      let visual = this.animals.get(animal.id);
      if (!visual) {
        const emoji = this.add.image(0, -1, "species-atlas");
        this.setSpeciesSprite(emoji, animal.species, 44);
        const spriteSpecies = isSpriteSpecies(animal.species) ? animal.species : null;
        const speciesSprite = this.add
          .sprite(
            0,
            spriteSpecies ? speciesSpriteY(spriteSpecies, -18) : -18,
            movementTextureKey(spriteSpecies ?? "rabbit"),
            movementFrame(0, 1),
          )
          .setScale(spriteSpecies ? speciesSpriteScale(spriteSpecies) : 0)
          .setVisible(Boolean(spriteSpecies));
        emoji.setVisible(!spriteSpecies);
        const population = this.add.text(0, spriteSpecies ? -58 : -43, "X1", { fontFamily: "Mona12, sans-serif", fontSize: "10px", color: "#fff2a4", backgroundColor: "#173d2de8", padding: { x: 4, y: 2 } }).setOrigin(0.5);
        const container = this.add.container(animal.x, animal.y, [emoji, speciesSprite, population]).setDepth(8);
        visual = {
          container,
          emoji,
          speciesSprite,
          population,
          targetX: animal.x,
          targetY: animal.y,
          speciesId: animal.species,
          facingX: 0,
          facingY: 1,
        };
        this.animals.set(animal.id, visual);
      }
      const previousX = visual.targetX;
      const previousY = visual.targetY;
      const deltaX = animal.x - previousX;
      const deltaY = animal.y - previousY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 0.05) {
        visual.facingX = deltaX;
        visual.facingY = deltaY;
      }
      visual.targetX = animal.x;
      visual.targetY = animal.y;
      this.updateAnimalSpeciesVisual(visual, animal.species, Math.hypot(deltaX, deltaY) > 0.05);
      visual.population.setY(isSpriteSpecies(animal.species) ? -58 : -43);
      visual.population.setText(`X${Math.max(0, animal.populationCount)}`);
      visual.container.setAlpha(animal.status === "ghost" || animal.status === "respawning" ? 0.45 : animal.extinct ? 0.2 : 1);
      visual.container.setVisible(canSeeThroughCover(viewerX, viewerY, animal.x, animal.y));
      visual.container.x = Phaser.Math.Linear(visual.container.x, visual.targetX, 0.35);
      visual.container.y = Phaser.Math.Linear(visual.container.y, visual.targetY, 0.35);
    });
  }

  private updateAnimalSpeciesVisual(visual: AnimalVisual, speciesId: string, moving: boolean): void {
    if (visual.speciesId !== speciesId) {
      visual.speciesId = speciesId;
      const spriteSpecies = isSpriteSpecies(speciesId) ? speciesId : null;
      visual.emoji.setVisible(!spriteSpecies);
      visual.speciesSprite.setVisible(Boolean(spriteSpecies));
      if (spriteSpecies) {
        visual.speciesSprite.setScale(speciesSpriteScale(spriteSpecies));
      } else {
        this.setSpeciesSprite(visual.emoji, speciesId, 44);
      }
    }

    const spriteSpecies = isSpriteSpecies(speciesId) ? speciesId : null;
    if (!spriteSpecies) return;
    const phase = moving ? Math.floor(this.time.now / 110) % 4 : 0;
    const hover = isFlyingSpriteSpecies(spriteSpecies) ? Math.sin(this.time.now / 170) * 2 : 0;
    visual.speciesSprite
      .setPosition(0, speciesSpriteY(spriteSpecies, -18) + hover)
      .setTexture(movementTextureKey(spriteSpecies), movementFrame(visual.facingX, visual.facingY, phase));
  }

  private syncEatTarget(
    players: PlayerSnapshot[],
    plants: PlantSnapshot[],
    animals: AnimalSnapshot[],
    selfId: string,
    viewerX: number,
    viewerY: number,
  ): void {
    const self = players.find((player) => player.id === selfId);
    // Use the reconciler's exact predicted pose for interaction logic. The
    // rendered pose is intentionally smoothed and may trail the hit position.
    const pose = self ? movementLogicPose(selfId) ?? self : null;
    if (!self || !pose || self.status !== "active") {
      this.targetRing?.setVisible(false);
      return;
    }
    const modeId = this.readModeId();
    const removedSpecies = this.readRemovedSpecies();
    const configuredMode = isGameModeId(modeId)
      ? modeConfig(modeId, isSpeciesId(removedSpecies) ? removedSpecies : undefined)
      : null;
    const activeSpecies: Set<string> | null = configuredMode ? new Set<string>(configuredMode.activeSpecies) : null;
    const candidates = [
      // A dropped player remains in the authoritative state for reconnection,
      // but must not be presented as an eat target while disconnected.
      ...players.filter((player) => player.id !== selfId && player.connected && player.status === "active" && (!activeSpecies || activeSpecies.has(player.species)) && canSeeThroughCover(viewerX, viewerY, player.x, player.y)),
      ...plants.filter((plant) => plant.active && (!activeSpecies || activeSpecies.has(plant.species))),
      ...animals.filter((animal) => animal.status === "active" && !animal.extinct && (!activeSpecies || activeSpecies.has(animal.species)) && canSeeThroughCover(viewerX, viewerY, animal.x, animal.y)),
    ].map((target) => ({ target, distance: Math.hypot(target.x - pose.x, target.y - pose.y) }))
      .filter(({ target, distance }) => distance <= EAT_RANGE && isWithinEatReach(pose, target))
      .sort((a, b) => a.distance - b.distance);
    const selected = candidates[0]?.target;
    if (!selected) {
      this.targetRing?.setVisible(false);
      return;
    }
    this.targetRing?.setPosition(selected.x, selected.y).setVisible(true);
  }

  private readModeId(): string {
    return useGameStore.getState().snapshot.modeId;
  }

  private readRemovedSpecies(): string {
    return useGameStore.getState().snapshot.removedSpecies;
  }

  private setSpeciesSprite(image: Phaser.GameObjects.Image, speciesId: string, size: number): void {
    const frames: Record<string, readonly [number, number]> = {
      grasshopper: [0, 0], caterpillar: [1, 0], rabbit: [2, 0], squirrel: [3, 0],
      frog: [0, 1], bulbul: [1, 1], duck: [2, 1], snake: [3, 1],
      weasel: [0, 2], hawk: [1, 2], grass: [2, 2], berry: [3, 2],
    };
    const [column, row] = frames[speciesId] ?? frames.grasshopper!;
    const texture = image.texture.getSourceImage() as HTMLImageElement;
    const cellWidth = texture.width / 4;
    const cellHeight = texture.height / 3;
    image
      .setCrop(column * cellWidth, row * cellHeight, cellWidth, cellHeight)
      .setOrigin((column + 0.5) / 4, (row + 0.5) / 3)
      .setScale(size / cellWidth, size / cellHeight);
  }

  private visualObject(id?: string): Phaser.GameObjects.Container | undefined {
    if (!id) return undefined;
    return this.players.get(id)?.container ?? this.animals.get(id)?.container ?? this.plants.get(id);
  }

  private playActionEffect(kind: string, actorId: string, targetId?: string, delta = 0): void {
    const actor = this.players.get(actorId);
    const actorObject = this.visualObject(actorId);
    const target = this.visualObject(targetId) ?? actorObject;
    if (!target) return;
    if ((targetId && !target.visible) || (actorObject && !actorObject.visible && actorId !== useGameStore.getState().selfId)) return;
    if (kind === "eat" && actor) {
      if (isSpriteSpecies(actor.speciesId) && hasSnatchSprite(actor.speciesId)) {
        const player = useGameStore.getState().snapshot.players.find((entry) => entry.id === actorId);
        this.playSpeciesSnatch(actor, actor.speciesId, player?.facingX ?? 0, player?.facingY ?? 1);
      }
      this.floatEffect(target.x, target.y - 30, "냠!", "#fff099");
    } else if (kind === "wrong" && actor) {
      if (isSpriteSpecies(actor.speciesId) && hasSnatchSprite(actor.speciesId)) {
        const player = useGameStore.getState().snapshot.players.find((entry) => entry.id === actorId);
        this.playSpeciesSnatch(actor, actor.speciesId, player?.facingX ?? 0, player?.facingY ?? 1);
      } else if (isSpriteSpecies(actor.speciesId) && hasSickSprite(actor.speciesId)) {
        const player = useGameStore.getState().snapshot.players.find((entry) => entry.id === actorId);
        if (actor.speciesAction !== "sick") this.playSpeciesSick(actor, actor.speciesId, player?.facingX ?? 0, player?.facingY ?? 1, Math.max(500, (player?.wrongUntil ?? Date.now() + 2000) - Date.now()));
      } else {
        this.tweens.add({ targets: actor.emoji, angle: { from: -16, to: 16 }, duration: 70, repeat: 4, yoyo: true, onComplete: () => actor.emoji.setAngle(0) });
      }
      this.floatEffect(target.x, target.y - 30, "우욱…", "#e5b7ff");
    } else if (kind === "population") {
      this.floatEffect(target.x, target.y - 45, delta >= 0 ? `+${delta}` : `${delta}`, delta >= 0 ? "#fff099" : "#ffaaa0");
    } else if (kind === "blocked") {
      this.floatEffect(target.x, target.y - 30, "튕!", "#bdeaff");
    } else if (kind === "respawn") {
      this.floatEffect(target.x, target.y - 30, "다시 출발!", "#d5ffb5");
    } else if (kind === "skill") {
      this.floatEffect(target.x, target.y - 30, "스킬!", "#bdeaff");
    }

    if (useGameStore.getState().selfId === actorId && (kind === "eat" || kind === "wrong" || kind === "blocked")) {
      navigator.vibrate?.(kind === "wrong" ? [45, 30, 70] : kind === "blocked" ? 55 : 30);
    }
  }

  private updatePlayerSpeciesVisual(visual: PlayerVisual, speciesId: string, facingX: number, facingY: number, moving: boolean): void {
    if (visual.speciesId !== speciesId && visual.speciesAction) this.stopSpeciesAction(visual, false);
    visual.speciesId = speciesId;
    const spriteSpecies = isSpriteSpecies(speciesId);
    visual.emoji.setVisible(!spriteSpecies);
    visual.speciesSprite.setVisible(spriteSpecies);
    if (spriteSpecies) {
      visual.speciesSprite.setScale(speciesSpriteScale(speciesId));
      if (!visual.speciesAction) {
        const flying = isFlyingSpriteSpecies(speciesId);
        const phase = moving || flying ? Math.floor(this.time.now / 110) % 4 : 0;
        const hover = flying ? Math.sin(this.time.now / 170) * 2 : 0;
        visual.speciesSprite.setPosition(0, speciesSpriteY(speciesId, -18) + hover);
        visual.speciesSprite.setTexture(movementTextureKey(speciesId), movementFrame(facingX, facingY, phase));
      }
    } else {
      this.setSpeciesSprite(visual.emoji, speciesId, 54);
    }
  }

  private playSpeciesSick(visual: PlayerVisual, speciesId: string, facingX: number, facingY: number, duration: number): void {
    if (!isSpriteSpecies(speciesId) || !hasSickSprite(speciesId)) return;
    this.stopSpeciesAction(visual, false);
    visual.speciesAction = "sick";
    visual.speciesSprite.setTexture(sickTextureKey(speciesId), sickFrame(facingX, facingY));
    this.tweens.add({
      targets: visual.speciesSprite,
      x: { from: -3, to: 3 },
      angle: { from: -3, to: 3 },
      duration: 65,
      yoyo: true,
      repeat: Math.max(0, Math.ceil(duration / 130) - 1),
    });
    visual.speciesActionTimer = this.time.delayedCall(duration, () => this.stopSpeciesAction(visual));
  }

  private playSpeciesSnatch(visual: PlayerVisual, speciesId: string, facingX: number, facingY: number): void {
    if (!isSpriteSpecies(speciesId) || !hasSnatchSprite(speciesId)) return;
    this.stopSpeciesAction(visual, false);
    visual.speciesAction = "snatch";
    const baseY = speciesSpriteY(speciesId, -18);
    visual.speciesSprite.setPosition(0, baseY).setAngle(0);
    visual.speciesSprite.play(snatchAnimationKey(speciesId, spriteDirection(facingX, facingY)));
    this.tweens.add({
      targets: visual.speciesSprite,
      y: baseY + speciesSnatchDrop(speciesId),
      duration: SNATCH_DURATION_MS / 2,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
    visual.speciesActionTimer = this.time.delayedCall(SNATCH_DURATION_MS, () => this.stopSpeciesAction(visual));
  }

  private createSpeciesAnimations(): void {
    SPRITE_SPECIES.forEach((speciesId) => {
      if (!hasSnatchSprite(speciesId)) return;
      SPRITE_DIRECTIONS.forEach((direction) => {
        const key = snatchAnimationKey(speciesId, direction);
        if (this.anims.exists(key)) return;
        const start = spriteDirectionRow(direction === "left" ? -1 : direction === "right" ? 1 : 0, direction === "up" ? -1 : direction === "down" ? 1 : 0) * 4;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(snatchTextureKey(speciesId), { start, end: start + 3 }),
          frameRate: SNATCH_FRAME_RATE,
          repeat: 0,
        });
      });
    });
  }

  private stopSpeciesAction(visual: PlayerVisual, restoreIdle = true): void {
    visual.speciesActionTimer?.remove(false);
    visual.speciesActionTimer = undefined;
    visual.speciesSprite.stop();
    this.tweens.killTweensOf(visual.speciesSprite);
    const y = isSpriteSpecies(visual.speciesId) ? speciesSpriteY(visual.speciesId, -18) : -18;
    visual.speciesSprite.setPosition(0, y).setAngle(0);
    visual.speciesAction = null;
    if (restoreIdle && isSpriteSpecies(visual.speciesId)) {
      visual.speciesSprite.setTexture(movementTextureKey(visual.speciesId), movementFrame(0, 1));
    }
  }

  private floatEffect(x: number, y: number, copy: string, color: string): void {
    const text = this.add.text(x, y, copy, { fontFamily: "Mona12, sans-serif", fontSize: "22px", color, stroke: "#173d2c", strokeThickness: 5 }).setOrigin(0.5).setDepth(42);
    this.tweens.add({ targets: text, y: y - 42, alpha: 0, scale: 1.2, duration: 650, ease: "Cubic.easeOut", onComplete: () => text.destroy() });
  }

  private drawShrinkBoundary(stage: number): void {
    if (!this.boundary || stage === this.lastShrinkStage) return;
    this.lastShrinkStage = stage;
    this.boundary.clear();
    const bounds = shrinkBounds(stage);
    this.boundary.lineStyle(stage > 0 ? 18 : 8, stage > 0 ? 0xecc84d : 0x38794a, 0.95);
    this.boundary.strokeRoundedRect(bounds.x, bounds.y, bounds.width, bounds.height, 26);
    if (stage > 0) {
      this.boundary.fillStyle(0x16382b, 0.22);
      this.boundary.fillRect(0, 0, WORLD_WIDTH, bounds.y);
      this.boundary.fillRect(0, bounds.y + bounds.height, WORLD_WIDTH, WORLD_HEIGHT - bounds.y - bounds.height);
      this.boundary.fillRect(0, bounds.y, bounds.x, bounds.height);
      this.boundary.fillRect(bounds.x + bounds.width, bounds.y, WORLD_WIDTH - bounds.x - bounds.width, bounds.height);
    }
  }
}
