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
  lastMovementTextureKey: string;
  lastMovementFrame: number;
  lastSpriteY: number;
  lastShieldedSpecies: string;
  lastShielded: boolean | null;
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
  facingChangedAt: number;
  lastMovementTextureKey: string;
  lastMovementFrame: number;
  lastSpriteY: number;
}

const NPC_FACING_CHANGE_HOLD_MS = 220;
const EAT_TARGET_REFRESH_MS = 75;
const LOW_RESOLUTION_CAMERA_ZOOM = 0.75;

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
  private lastPlayerList: PlayerSnapshot[] | null = null;
  private lastPlantList: PlantSnapshot[] | null = null;
  private lastAnimalList: AnimalSnapshot[] | null = null;
  private lastViewerCoverId: string | null | undefined;
  private nextEatTargetUpdateAt = 0;
  private lastEatTargetId: string | null = null;
  private lastEatTargetX = Number.NaN;
  private lastEatTargetY = Number.NaN;
  private lastHasSelf: boolean | null = null;

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
    this.lastViewerCoverId = updateWorldBushes(this.bushes, viewerX, viewerY, this.lastViewerCoverId);

    this.syncPlayers(state.snapshot.players, state.selfId, viewerX, viewerY);
    if (state.snapshot.plants !== this.lastPlantList) {
      this.lastPlantList = state.snapshot.plants;
      this.syncPlants(state.snapshot.plants);
    }
    this.syncAnimals(state.snapshot.animals, viewerX, viewerY);
    if (this.time.now >= this.nextEatTargetUpdateAt) {
      this.nextEatTargetUpdateAt = this.time.now + EAT_TARGET_REFRESH_MS;
      this.syncEatTarget(state.snapshot.players, state.snapshot.plants, state.snapshot.animals, state.selfId, viewerX, viewerY);
    }
    if (state.effect && state.effect.id !== this.lastEffectId) {
      this.lastEffectId = state.effect.id;
      this.playActionEffect(state.effect.kind, state.effect.actorId, state.effect.targetId, state.effect.delta);
    }
    this.drawShrinkBoundary(state.snapshot.shrinkStage);
    const hasSelf = Boolean(self);
    if (!hasSelf) {
      if (this.lastHasSelf !== false) {
        this.cameras.main.stopFollow();
        this.cameras.main.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
      }
      const overviewZoom = Math.min(this.scale.width / WORLD_WIDTH, this.scale.height / WORLD_HEIGHT) * 0.94;
      if (this.cameras.main.zoom !== overviewZoom) this.cameras.main.setZoom(overviewZoom);
    } else if (this.cameras.main.zoom !== LOW_RESOLUTION_CAMERA_ZOOM) {
      this.cameras.main.setZoom(LOW_RESOLUTION_CAMERA_ZOOM);
    }
    this.lastHasSelf = hasSelf;

    this.players.forEach((visual) => {
      if (visual.container.x !== visual.targetX || visual.container.y !== visual.targetY) visual.container.setPosition(visual.targetX, visual.targetY);
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
    if (players !== this.lastPlayerList) {
      this.lastPlayerList = players;
      const ids = new Set(players.map((player) => player.id));
      this.players.forEach((visual, id) => {
        if (!ids.has(id)) {
          this.stopSpeciesAction(visual, false);
          visual.container.destroy(true);
          this.players.delete(id);
        }
      });
    }

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
           lastMovementTextureKey: "", lastMovementFrame: -1, lastSpriteY: Number.NaN,
           lastShieldedSpecies: "", lastShielded: null,
        };
        this.players.set(player.id, visual);
        if (player.id === selfId) this.cameras.main.startFollow(container, true, 0.3, 0.3);
      }
      const moving = Math.hypot(renderPosition.x - visual.targetX, renderPosition.y - visual.targetY) > 0.05;
      visual.targetX = renderPosition.x;
      visual.targetY = renderPosition.y;
      const populationText = `X${Math.max(0, player.populationCount)}`;
      if (visual.label.text !== player.name) visual.label.setText(player.name);
      if (visual.population.text !== populationText) visual.population.setText(populationText);
      this.updatePlayerSpeciesVisual(visual, player.species, renderPosition.facingX, renderPosition.facingY, moving);
      this.updateCaterpillarShieldVisual(visual, player.species, player.shielded);
      const alpha = player.status === "ghost" || player.status === "respawning" ? 0.45 : player.status === "extinct" ? 0.2 : player.stealth ? 0.25 : 1;
      if (visual.container.alpha !== alpha) visual.container.setAlpha(alpha);
      const scale = player.shielded ? 0.82 : 1;
      if (visual.container.scaleX !== scale || visual.container.scaleY !== scale) visual.container.setScale(scale);
      const visible = player.id === selfId || (player.status !== "ghost" && canSeeThroughCover(viewerX, viewerY, renderPosition.x, renderPosition.y));
      if (visual.container.visible !== visible) visual.container.setVisible(visible);
      const now = Date.now();
      const statusText = player.wrongUntil > now ? "배탈" : player.shielded ? "방어" : player.escapeUntil > now ? "탈출" : player.status === "respawning" ? "재등장" : player.status === "ghost" ? "관찰자" : player.status === "extinct" ? "관찰 중" : "";
      if (visual.status.text !== statusText) visual.status.setText(statusText);
      if (isSpriteSpecies(player.species) && hasSickSprite(player.species) && player.wrongUntil > now) {
        if (visual.speciesAction !== "sick") this.playSpeciesSick(visual, player.species, renderPosition.facingX, renderPosition.facingY, player.wrongUntil - now);
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
      if (container.x !== plant.x || container.y !== plant.y) container.setPosition(plant.x, plant.y);
      if (container.visible !== plant.active) container.setVisible(plant.active);
    });
  }

  private syncAnimals(animals: AnimalSnapshot[], viewerX: number, viewerY: number): void {
    if (animals !== this.lastAnimalList) {
      this.lastAnimalList = animals;
      const ids = new Set(animals.map((animal) => animal.id));
      this.animals.forEach((visual, id) => {
        if (!ids.has(id)) {
          visual.container.destroy(true);
          this.animals.delete(id);
        }
      });
    }
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
          facingChangedAt: 0,
           lastMovementTextureKey: "", lastMovementFrame: -1, lastSpriteY: Number.NaN,
        };
        this.animals.set(animal.id, visual);
      }
      const now = this.time.now;
      const previousX = visual.targetX;
      const previousY = visual.targetY;
      const deltaX = animal.x - previousX;
      const deltaY = animal.y - previousY;
      const movementDistance = Math.hypot(deltaX, deltaY);
      const moving = movementDistance > 0.05;
      if (moving) {
        const nextFacing = spriteDirection(deltaX, deltaY);
        const currentFacing = spriteDirection(visual.facingX, visual.facingY);
        if (nextFacing === currentFacing || now - visual.facingChangedAt >= NPC_FACING_CHANGE_HOLD_MS) {
          if (nextFacing !== currentFacing) visual.facingChangedAt = now;
          visual.facingX = deltaX;
          visual.facingY = deltaY;
        }
      }
      visual.targetX = animal.x;
      visual.targetY = animal.y;
      this.updateAnimalSpeciesVisual(visual, animal.species, moving);
      const populationY = isSpriteSpecies(animal.species) ? -58 : -43;
      if (visual.population.y !== populationY) visual.population.setY(populationY);
      const populationText = `X${Math.max(0, animal.populationCount)}`;
      if (visual.population.text !== populationText) visual.population.setText(populationText);
      const alpha = animal.status === "ghost" || animal.status === "respawning" ? 0.45 : animal.extinct ? 0.2 : 1;
      if (visual.container.alpha !== alpha) visual.container.setAlpha(alpha);
      const visible = animal.status !== "ghost" && canSeeThroughCover(viewerX, viewerY, animal.x, animal.y);
      if (visual.container.visible !== visible) visual.container.setVisible(visible);
      const nextX = Phaser.Math.Linear(visual.container.x, visual.targetX, 0.35);
      const nextY = Phaser.Math.Linear(visual.container.y, visual.targetY, 0.35);
      if (visual.container.x !== nextX || visual.container.y !== nextY) visual.container.setPosition(nextX, nextY);
    });
  }

  private updateAnimalSpeciesVisual(visual: AnimalVisual, speciesId: string, moving: boolean): void {
    const speciesChanged = visual.speciesId !== speciesId;
    if (speciesChanged) {
      visual.speciesId = speciesId;
      visual.lastMovementTextureKey = "";
      visual.lastMovementFrame = -1;
      visual.lastSpriteY = Number.NaN;
      const spriteSpecies = isSpriteSpecies(speciesId) ? speciesId : null;
      if (visual.emoji.visible === Boolean(spriteSpecies)) visual.emoji.setVisible(!spriteSpecies);
      if (visual.speciesSprite.visible !== Boolean(spriteSpecies)) visual.speciesSprite.setVisible(Boolean(spriteSpecies));
      if (spriteSpecies) visual.speciesSprite.setScale(speciesSpriteScale(spriteSpecies));
      else this.setSpeciesSprite(visual.emoji, speciesId, 44);
    }

    const spriteSpecies = isSpriteSpecies(speciesId) ? speciesId : null;
    if (!spriteSpecies) return;
    if (visual.emoji.visible) visual.emoji.setVisible(false);
    if (!visual.speciesSprite.visible) visual.speciesSprite.setVisible(true);
    const scale = speciesSpriteScale(spriteSpecies);
    if (visual.speciesSprite.scaleX !== scale || visual.speciesSprite.scaleY !== scale) visual.speciesSprite.setScale(scale);
    const phase = moving ? Math.floor(this.time.now / 110) % 4 : 0;
    const hover = isFlyingSpriteSpecies(spriteSpecies) ? Math.round(Math.sin(this.time.now / 170) * 2) : 0;
    const spriteY = speciesSpriteY(spriteSpecies, -18) + hover;
    if (visual.lastSpriteY !== spriteY) {
      visual.lastSpriteY = spriteY;
      visual.speciesSprite.setPosition(0, spriteY);
    }
    const textureKey = movementTextureKey(spriteSpecies);
    const frame = movementFrame(visual.facingX, visual.facingY, phase);
    if (visual.lastMovementTextureKey !== textureKey || visual.lastMovementFrame !== frame) {
      visual.lastMovementTextureKey = textureKey;
      visual.lastMovementFrame = frame;
      visual.speciesSprite.setTexture(textureKey, frame);
    }
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
      if (this.lastEatTargetId !== null) {
        this.lastEatTargetId = null;
        this.lastEatTargetX = Number.NaN;
        this.lastEatTargetY = Number.NaN;
        this.targetRing?.setVisible(false);
      }
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
      if (this.lastEatTargetId !== null) {
        this.lastEatTargetId = null;
        this.lastEatTargetX = Number.NaN;
        this.lastEatTargetY = Number.NaN;
        this.targetRing?.setVisible(false);
      }
      return;
    }
    if (this.lastEatTargetId !== selected.id || this.lastEatTargetX !== selected.x || this.lastEatTargetY !== selected.y) {
      this.lastEatTargetId = selected.id;
      this.lastEatTargetX = selected.x;
      this.lastEatTargetY = selected.y;
      this.targetRing?.setPosition(selected.x, selected.y);
    }
    if (!this.targetRing?.visible) this.targetRing?.setVisible(true);
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
    const animalActor = this.animals.get(actorId);
    const actorObject = this.visualObject(actorId);
    const target = this.visualObject(targetId) ?? actorObject;
    if (!target) return;
    if ((targetId && !target.visible && !(kind === "wrong" && actorObject?.visible)) || (actorObject && !actorObject.visible && actorId !== useGameStore.getState().selfId)) return;
    if (kind === "eat" && actor) {
      if (isSpriteSpecies(actor.speciesId) && hasSnatchSprite(actor.speciesId)) {
        const player = useGameStore.getState().snapshot.players.find((entry) => entry.id === actorId);
        this.playSpeciesSnatch(actor, actor.speciesId, player?.facingX ?? 0, player?.facingY ?? 1);
      }
      this.floatEffect(target.x, target.y - 30, "냠!", "#fff099");
    } else if (kind === "wrong" && (actor || animalActor)) {
      if (actor) {
        if (isSpriteSpecies(actor.speciesId) && hasSnatchSprite(actor.speciesId)) {
          const player = useGameStore.getState().snapshot.players.find((entry) => entry.id === actorId);
          this.playSpeciesSnatch(actor, actor.speciesId, player?.facingX ?? 0, player?.facingY ?? 1);
        } else if (isSpriteSpecies(actor.speciesId) && hasSickSprite(actor.speciesId)) {
          const player = useGameStore.getState().snapshot.players.find((entry) => entry.id === actorId);
          if (actor.speciesAction !== "sick") this.playSpeciesSick(actor, actor.speciesId, player?.facingX ?? 0, player?.facingY ?? 1, Math.max(500, (player?.wrongUntil ?? Date.now() + 2000) - Date.now()));
        } else {
          this.tweens.add({ targets: actor.emoji, angle: { from: -16, to: 16 }, duration: 70, repeat: 4, yoyo: true, onComplete: () => actor.emoji.setAngle(0) });
        }
      } else {
        this.tweens.add({ targets: animalActor!.container, angle: { from: -8, to: 8 }, duration: 75, repeat: 4, yoyo: true, onComplete: () => animalActor!.container.setAngle(0) });
      }
      const effectTarget = actorObject ?? target;
      this.floatEffect(effectTarget.x, effectTarget.y - 30, "우욱…", "#e5b7ff");
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
    const speciesChanged = visual.speciesId !== speciesId;
    if (speciesChanged && visual.speciesAction) this.stopSpeciesAction(visual, false);
    if (speciesChanged) {
      visual.speciesId = speciesId;
      visual.lastMovementTextureKey = "";
      visual.lastMovementFrame = -1;
      visual.lastSpriteY = Number.NaN;
      visual.lastShieldedSpecies = "";
      visual.lastShielded = null;
    }

    const spriteSpecies = isSpriteSpecies(speciesId);
    if (visual.emoji.visible === spriteSpecies) visual.emoji.setVisible(!spriteSpecies);
    if (visual.speciesSprite.visible !== spriteSpecies) visual.speciesSprite.setVisible(spriteSpecies);
    if (!spriteSpecies) {
      if (speciesChanged) this.setSpeciesSprite(visual.emoji, speciesId, 54);
      return;
    }

    const scale = speciesSpriteScale(speciesId);
    if (visual.speciesSprite.scaleX !== scale || visual.speciesSprite.scaleY !== scale) visual.speciesSprite.setScale(scale);
    if (visual.speciesAction) return;

    const flying = isFlyingSpriteSpecies(speciesId);
    const phase = moving || flying ? Math.floor(this.time.now / 110) % 4 : 0;
    const hover = flying ? Math.round(Math.sin(this.time.now / 170) * 2) : 0;
    const spriteY = speciesSpriteY(speciesId, -18) + hover;
    if (visual.lastSpriteY !== spriteY) {
      visual.lastSpriteY = spriteY;
      visual.speciesSprite.setPosition(0, spriteY);
    }
    const textureKey = movementTextureKey(speciesId);
    const frame = movementFrame(facingX, facingY, phase);
    if (visual.lastMovementTextureKey !== textureKey || visual.lastMovementFrame !== frame) {
      visual.lastMovementTextureKey = textureKey;
      visual.lastMovementFrame = frame;
      visual.speciesSprite.setTexture(textureKey, frame);
    }
  }

  private updateCaterpillarShieldVisual(visual: PlayerVisual, speciesId: string, shielded: boolean): void {
    if (visual.lastShieldedSpecies === speciesId && visual.lastShielded === shielded) return;
    visual.lastShieldedSpecies = speciesId;
    visual.lastShielded = shielded;
    const curled = speciesId === "caterpillar" && shielded;
    if (curled) {
      visual.emoji.setTint(0x858585);
      visual.speciesSprite.setTint(0x858585);
    } else {
      visual.emoji.clearTint();
      visual.speciesSprite.clearTint();
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
      visual.lastMovementTextureKey = "";
      visual.lastMovementFrame = -1;
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
