import Phaser from "phaser";
import {
  SPECIES,
  EAT_RANGE,
  WORLD_HEIGHT,
  WORLD_OBSTACLES,
  WORLD_WIDTH,
  isSpeciesId,
  isWithinEatReach,
  shrinkBounds,
} from "@feed-chain/shared";
import { movementRenderPose, tickMovementNetcode } from "../network/movementNetcode";
import { useGameStore } from "../store/gameStore";
import type { AnimalSnapshot, PlantSnapshot, PlayerSnapshot } from "../types";
import {
  SPECIES_FRAME_HEIGHT,
  SPECIES_FRAME_WIDTH,
  SPECIES_SPRITE_SCALE,
  SPRITE_SPECIES,
  isSpriteSpecies,
  movementFrame,
  movementTextureKey,
  sickFrame,
  sickTextureKey,
  speciesSpriteY,
  speciesSpriteConfig,
} from "./speciesAnimations";

interface PlayerVisual {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  emoji: Phaser.GameObjects.Image;
  speciesSprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  direction: Phaser.GameObjects.Triangle;
  targetX: number;
  targetY: number;
  speciesId: string;
  speciesAction: "sick" | null;
  speciesActionTimer?: Phaser.Time.TimerEvent;
}

type AnimalVisual = Omit<PlayerVisual, "speciesSprite" | "speciesId" | "speciesAction" | "speciesActionTimer">;

export class GameScene extends Phaser.Scene {
  private players = new Map<string, PlayerVisual>();
  private plants = new Map<string, Phaser.GameObjects.Container>();
  private animals = new Map<string, AnimalVisual>();
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<string, Phaser.Input.Keyboard.Key>;
  private boundary?: Phaser.GameObjects.Graphics;
  private lastShrinkStage = -1;
  private targetRing?: Phaser.GameObjects.Arc;
  private targetHint?: Phaser.GameObjects.Text;
  private lastEffectId = 0;

  constructor() {
    super("ecosystem");
  }

  preload(): void {
    this.load.image("species-atlas", "/assets/pixel/species-atlas.png");
    SPRITE_SPECIES.forEach((speciesId) => {
      const config = speciesSpriteConfig(speciesId);
      this.load.spritesheet(movementTextureKey(speciesId), `/assets/pixel/animals/${config.movementFile}`, {
        frameWidth: SPECIES_FRAME_WIDTH,
        frameHeight: SPECIES_FRAME_HEIGHT,
      });
      this.load.spritesheet(sickTextureKey(speciesId), `/assets/pixel/animals/${config.sickFile}`, {
        frameWidth: SPECIES_FRAME_WIDTH,
        frameHeight: SPECIES_FRAME_HEIGHT,
      });
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#83c867");
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawWorld();
    this.targetRing = this.add.circle(0, 0, 38, 0xffdc67, 0.08).setStrokeStyle(4, 0xffdc67, 0.95).setDepth(18).setVisible(false);
    this.targetHint = this.add.text(0, -51, "먹기 대상", {
      fontFamily: "Arial, sans-serif", fontStyle: "bold", fontSize: "12px", color: "#fff7c2", backgroundColor: "#173d2cdd", padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(19).setVisible(false);
    this.boundary = this.add.graphics().setDepth(3);
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

    this.syncPlayers(state.snapshot.players, state.selfId);
    this.syncPlants(state.snapshot.plants);
    this.syncAnimals(state.snapshot.animals);
    this.syncEatTarget(state.snapshot.players, state.snapshot.plants, state.snapshot.animals, state.selfId);
    if (state.effect && state.effect.id !== this.lastEffectId) {
      this.lastEffectId = state.effect.id;
      this.playActionEffect(state.effect.kind, state.effect.actorId, state.effect.targetId);
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
    const graphics = this.add.graphics();
    graphics.fillStyle(0x639f47).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    for (let x = 0; x < WORLD_WIDTH; x += 64) {
      for (let y = 0; y < WORLD_HEIGHT; y += 64) {
        if ((x / 64 + y / 64) % 3 === 0) graphics.fillStyle(0x6aa64b, 0.48).fillRect(x, y, 64, 64);
        const seed = ((x * 17 + y * 31) >>> 3) % 43;
        if (seed % 4 === 0) graphics.fillStyle(0x4f893b, 0.72).fillRect(x + 12 + seed, y + 18, 5, 9);
        if (seed % 7 === 0) graphics.fillStyle(0x8cbd55, 0.85).fillRect(x + 38, y + 43, 7, 5);
      }
    }
    graphics.fillStyle(0x9d8b52).fillRect(WORLD_WIDTH * 0.44 - 12, 0, WORLD_WIDTH * 0.12 + 24, WORLD_HEIGHT);
    graphics.fillStyle(0xc1aa66).fillRect(WORLD_WIDTH * 0.44, 0, WORLD_WIDTH * 0.12, WORLD_HEIGHT);
    graphics.fillStyle(0x9d8b52).fillRect(0, WORLD_HEIGHT * 0.44 - 12, WORLD_WIDTH, WORLD_HEIGHT * 0.12 + 24);
    graphics.fillStyle(0xc1aa66).fillRect(0, WORLD_HEIGHT * 0.44, WORLD_WIDTH, WORLD_HEIGHT * 0.12);

    WORLD_OBSTACLES.forEach((rect, index) => {
      graphics.fillStyle(0x183f2c).fillRect(rect.x - 8, rect.y + 10, rect.width + 16, rect.height + 10);
      graphics.fillStyle(0x805c36).fillRect(rect.x - 5, rect.y - 5, rect.width + 10, rect.height + 10);
      graphics.fillStyle(index % 2 ? 0x326a3d : 0x397746).fillRect(rect.x, rect.y, rect.width, rect.height);
      graphics.fillStyle(0x70a34d).fillRect(rect.x + 8, rect.y + 8, rect.width - 16, 7);
      const treeCount = Math.max(2, Math.floor(rect.width / 55));
      for (let i = 0; i < treeCount; i += 1) {
        this.drawPixelTree(rect.x + 24 + i * 48, rect.y + 22 + (i % 2) * 38, index % 2 === 0);
      }
    });

    const landmarks = [
      { x: 470, y: 170, icon: "🌲", name: "솔바람 숲" },
      { x: 3820, y: 170, icon: "🌼", name: "들꽃 언덕" },
      { x: 420, y: 2740, icon: "🪨", name: "바위 골짜기" },
      { x: 3820, y: 2740, icon: "💧", name: "물빛 쉼터" },
      { x: 2190, y: 1370, icon: "🧭", name: "만남의 광장" },
    ];
    landmarks.forEach(({ x, y, icon, name }) => {
      this.add.text(x, y, `${icon} ${name}`, {
        fontFamily: "Arial Rounded MT Bold, sans-serif",
        fontSize: "28px",
        color: "#fffbe8",
        stroke: "#295b3b",
        strokeThickness: 7,
      }).setDepth(2);
    });
  }

  private drawPixelTree(x: number, y: number, pine: boolean): void {
    const tree = this.add.graphics().setPosition(x, y).setDepth(2);
    tree.fillStyle(0x503724).fillRect(-5, 25, 12, 15);
    tree.fillStyle(0x173f2a).fillRect(-20, 2, 42, 28);
    tree.fillStyle(pine ? 0x245d35 : 0x2f6d3b).fillRect(-16, -8, 34, 26);
    tree.fillStyle(0x3f8445).fillRect(-11, -17, 24, 22);
    tree.fillStyle(0x78a94d).fillRect(-6, -14, 8, 8);
  }

  private syncPlayers(players: PlayerSnapshot[], selfId: string): void {
    const ids = new Set(players.map((player) => player.id));
    this.players.forEach((visual, id) => {
      if (!ids.has(id)) {
        this.stopSpeciesAction(visual, false);
        visual.container.destroy(true);
        this.players.delete(id);
      }
    });

    players.forEach((player) => {
      const species = isSpeciesId(player.species) ? SPECIES[player.species] : SPECIES.grasshopper;
      const renderPosition = movementRenderPose(player.id) ?? player;
      let visual = this.players.get(player.id);
      if (!visual) {
        const body = this.add.circle(0, 0, 29, species.color, 1).setStrokeStyle(player.id === selfId ? 6 : 3, player.id === selfId ? 0xfff07a : 0x173d2c);
        const emoji = this.add.image(0, -2, "species-atlas");
        this.setSpeciesSprite(emoji, player.species, 54);
        const speciesSprite = this.add.sprite(0, -18, movementTextureKey("rabbit"), movementFrame(player.facingX, player.facingY)).setScale(SPECIES_SPRITE_SCALE).setVisible(false);
        const label = this.add.text(0, 42, player.name, {
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
          fontSize: "16px",
          color: "#ffffff",
          backgroundColor: "#173d2ccc",
          padding: { x: 7, y: 3 },
        }).setOrigin(0.5);
        const status = this.add.text(0, -48, "", { fontSize: "20px", fontStyle: "bold", color: "#fff" }).setOrigin(0.5);
        const direction = this.add.triangle(0, 34, 0, -8, -6, 7, 6, 7, 0xffed82, 0.95).setStrokeStyle(2, 0x173d2c);
        const container = this.add.container(renderPosition.x, renderPosition.y, [direction, body, emoji, speciesSprite, label, status]).setDepth(player.id === selfId ? 20 : 10);
        visual = {
          container, body, emoji, speciesSprite, label, status, direction,
          targetX: renderPosition.x, targetY: renderPosition.y,
          speciesId: player.species, speciesAction: null,
        };
        this.players.set(player.id, visual);
        if (player.id === selfId) this.cameras.main.startFollow(container, true, 0.3, 0.3);
      }
      const moving = Math.hypot(renderPosition.x - visual.targetX, renderPosition.y - visual.targetY) > 0.05;
      visual.targetX = renderPosition.x;
      visual.targetY = renderPosition.y;
      visual.body.setFillStyle(species.color);
      this.updatePlayerSpeciesVisual(visual, player.species, renderPosition.facingX, renderPosition.facingY, moving);
      const facingAngle = Math.atan2(renderPosition.facingY, renderPosition.facingX);
      visual.direction.setPosition(Math.cos(facingAngle) * 36, Math.sin(facingAngle) * 36).setRotation(facingAngle + Math.PI / 2);
      visual.container.setAlpha(player.status === "ghost" || player.status === "extinct" ? 0.45 : player.stealth ? 0.25 : 1);
      visual.container.setScale(player.shielded ? 0.82 : 1);
      visual.status.setText(player.wrongUntil > Date.now() ? "😵 배탈" : player.shielded ? "🪨 방어" : player.escapeUntil > Date.now() ? "💨 탈출" : player.status === "ghost" ? "👻" : player.status === "extinct" ? "관찰 중" : "");
      if (isSpriteSpecies(player.species) && player.wrongUntil > Date.now()) {
        if (visual.speciesAction !== "sick") this.playSpeciesSick(visual, player.species, renderPosition.facingX, renderPosition.facingY, player.wrongUntil - Date.now());
      } else if (visual.speciesAction === "sick") {
        this.stopSpeciesAction(visual);
      }
    });
  }

  private syncPlants(plants: PlantSnapshot[]): void {
    plants.forEach((plant) => {
      let container = this.plants.get(plant.id);
      if (!container) {
        const sprite = this.add.graphics();
        sprite.fillStyle(0x295f36, 0.45).fillRect(-18, 15, 38, 9);
        if (plant.species === "berry") {
          sprite.fillStyle(0x503724).fillRect(-4, -2, 9, 25);
          sprite.fillStyle(0x1f5933).fillRect(-17, -22, 36, 27);
          sprite.fillStyle(0x3f8445).fillRect(-12, -28, 25, 20);
          sprite.fillStyle(0xd65a4f).fillRect(-10, -17, 5, 5).fillRect(7, -12, 5, 5).fillRect(-1, -25, 5, 5);
        } else {
          sprite.fillStyle(0x2e733c).fillRect(-14, -7, 7, 26).fillRect(-3, -18, 7, 38).fillRect(8, -10, 7, 29);
          sprite.fillStyle(0x79ad4f).fillRect(-11, -3, 5, 14).fillRect(0, -14, 5, 18).fillRect(11, -6, 5, 16);
        }
        container = this.add.container(plant.x, plant.y, [sprite]).setDepth(5);
        this.plants.set(plant.id, container);
      }
      container.setVisible(plant.active);
    });
  }

  private syncAnimals(animals: AnimalSnapshot[]): void {
    const ids = new Set(animals.map((animal) => animal.id));
    this.animals.forEach((visual, id) => {
      if (!ids.has(id)) {
        visual.container.destroy(true);
        this.animals.delete(id);
      }
    });
    animals.forEach((animal) => {
      const species = isSpeciesId(animal.species) ? SPECIES[animal.species] : SPECIES.grasshopper;
      let visual = this.animals.get(animal.id);
      if (!visual) {
        const body = this.add.circle(0, 0, 23, species.color, 0.9).setStrokeStyle(3, 0xfff4b0);
        const emoji = this.add.image(0, -1, "species-atlas");
        this.setSpeciesSprite(emoji, animal.species, 44);
        const label = this.add.text(0, 34, "새끼", { fontSize: "11px", fontStyle: "bold", color: "#fff", backgroundColor: "#274f3dcc", padding: { x: 5, y: 2 } }).setOrigin(0.5);
        const status = this.add.text(0, -38, "", { fontSize: "14px" }).setOrigin(0.5);
        const direction = this.add.triangle(0, 29, 0, -6, -5, 6, 5, 6, 0xffed82, 0).setVisible(false);
        const container = this.add.container(animal.x, animal.y, [direction, body, emoji, label, status]).setDepth(8);
        visual = { container, body, emoji, label, status, direction, targetX: animal.x, targetY: animal.y };
        this.animals.set(animal.id, visual);
      }
      visual.targetX = animal.x;
      visual.targetY = animal.y;
      visual.status.setText(animal.hunger < 25 ? "🍽️" : "");
      visual.container.x = Phaser.Math.Linear(visual.container.x, visual.targetX, 0.35);
      visual.container.y = Phaser.Math.Linear(visual.container.y, visual.targetY, 0.35);
    });
  }

  private syncEatTarget(players: PlayerSnapshot[], plants: PlantSnapshot[], animals: AnimalSnapshot[], selfId: string): void {
    const self = players.find((player) => player.id === selfId);
    const pose = self ? movementRenderPose(selfId) ?? self : null;
    if (!self || !pose || self.status !== "active") {
      this.targetRing?.setVisible(false);
      this.targetHint?.setVisible(false);
      return;
    }
    const candidates = [
      ...players.filter((player) => player.id !== selfId && player.status === "active"),
      ...plants.filter((plant) => plant.active),
      ...animals,
    ].map((target) => ({ target, distance: Math.hypot(target.x - pose.x, target.y - pose.y) }))
      .filter(({ target, distance }) => distance <= EAT_RANGE && isWithinEatReach(pose, target))
      .sort((a, b) => a.distance - b.distance);
    const selected = candidates[0]?.target;
    if (!selected) {
      this.targetRing?.setVisible(false);
      this.targetHint?.setVisible(false);
      return;
    }
    this.targetRing?.setPosition(selected.x, selected.y).setVisible(true);
    this.targetHint?.setPosition(selected.x, selected.y - 51).setVisible(true);
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

  private playActionEffect(kind: string, actorId: string, targetId?: string): void {
    const actor = this.players.get(actorId);
    const target = this.visualObject(targetId) ?? actor?.container;
    if (!target) return;
    const color = kind === "eat" ? 0xffdf65 : kind === "wrong" ? 0xb56cff : kind === "blocked" ? 0x8ed8ff : 0x70cfff;
    const ring = this.add.circle(target.x, target.y, 26, color, 0.12).setStrokeStyle(6, color, 0.95).setDepth(40);
    this.tweens.add({ targets: ring, scale: 2.1, alpha: 0, duration: 420, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });

    if (kind === "eat" && actor) {
      this.floatEffect(target.x, target.y - 30, "냠!", "#fff099");
    } else if (kind === "wrong" && actor) {
      if (isSpriteSpecies(actor.speciesId)) {
        const player = useGameStore.getState().snapshot.players.find((entry) => entry.id === actorId);
        if (actor.speciesAction !== "sick") this.playSpeciesSick(actor, actor.speciesId, player?.facingX ?? 0, player?.facingY ?? 1, Math.max(500, (player?.wrongUntil ?? Date.now() + 2000) - Date.now()));
      } else {
        this.tweens.add({ targets: actor.emoji, angle: { from: -16, to: 16 }, duration: 70, repeat: 4, yoyo: true, onComplete: () => actor.emoji.setAngle(0) });
      }
      this.floatEffect(target.x, target.y - 30, "우욱…", "#e5b7ff");
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
      visual.speciesSprite.setY(speciesSpriteY(speciesId, -18));
      if (!visual.speciesAction) {
        const phase = moving ? Math.floor(this.time.now / 110) % 4 : 0;
        visual.speciesSprite.setTexture(movementTextureKey(speciesId), movementFrame(facingX, facingY, phase));
      }
    } else {
      this.setSpeciesSprite(visual.emoji, speciesId, 54);
    }
  }

  private playSpeciesSick(visual: PlayerVisual, speciesId: string, facingX: number, facingY: number, duration: number): void {
    if (!isSpriteSpecies(speciesId)) return;
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
    const text = this.add.text(x, y, copy, { fontFamily: "Arial, sans-serif", fontStyle: "bold", fontSize: "22px", color, stroke: "#173d2c", strokeThickness: 5 }).setOrigin(0.5).setDepth(42);
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
