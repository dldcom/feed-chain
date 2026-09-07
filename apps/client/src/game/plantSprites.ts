import Phaser from "phaser";

export const PLANT_FRAME_WIDTH = 304;
export const PLANT_FRAME_HEIGHT = 352;
export const PLANT_SPRITE_SCALE = 0.27;
export const PLANT_BASE_Y = 24;

export const PLANT_SPECIES = ["grass", "berry", "acorn", "clover"] as const;
export type PlantSpeciesId = (typeof PLANT_SPECIES)[number];

interface PlantSpriteConfig {
  file: string;
  texture: string;
  scale?: number;
  yOffset: number;
}

const PLANT_SPRITES: Record<PlantSpeciesId, PlantSpriteConfig> = {
  grass: {
    file: "grass.png",
    texture: "plant-grass",
    yOffset: 0,
  },
  berry: {
    file: "berry.png",
    texture: "plant-berry",
    yOffset: 0,
  },
  acorn: {
    file: "acorn.png",
    texture: "plant-acorn",
    scale: 0.28,
    yOffset: 0,
  },
  clover: {
    file: "clover.png",
    texture: "plant-clover",
    yOffset: 0,
  },
};

export function isPlantSpriteSpecies(speciesId: string): speciesId is PlantSpeciesId {
  return PLANT_SPECIES.includes(speciesId as PlantSpeciesId);
}

export function plantSpriteConfig(speciesId: PlantSpeciesId): PlantSpriteConfig {
  return PLANT_SPRITES[speciesId];
}

export function plantTextureKey(speciesId: PlantSpeciesId, prefix = ""): string {
  return `${prefix}${PLANT_SPRITES[speciesId].texture}`;
}

export function plantSpriteScale(speciesId: PlantSpeciesId): number {
  return PLANT_SPRITES[speciesId].scale ?? PLANT_SPRITE_SCALE;
}

export function plantSpriteY(speciesId: PlantSpeciesId, baseY = PLANT_BASE_Y): number {
  return baseY + PLANT_SPRITES[speciesId].yOffset;
}

function drawFallbackPlant(graphics: Phaser.GameObjects.Graphics, speciesId: string): void {
  if (speciesId === "berry") {
    graphics.fillStyle(0x503724).fillRect(-4, -2, 9, 25);
    graphics.fillStyle(0x1f5933).fillRect(-17, -22, 36, 27);
    graphics.fillStyle(0x3f8445).fillRect(-12, -28, 25, 20);
    graphics.fillStyle(0xd65a4f).fillRect(-10, -17, 5, 5).fillRect(7, -12, 5, 5).fillRect(-1, -25, 5, 5);
  } else if (speciesId === "acorn") {
    graphics.fillStyle(0x674125).fillRect(-5, -10, 10, 27);
    graphics.fillStyle(0xb77942).fillRect(-14, -20, 28, 16);
    graphics.fillStyle(0x8e5b31).fillRect(-10, -24, 20, 6);
  } else if (speciesId === "clover") {
    graphics.fillStyle(0x2e733c).fillRect(-3, -1, 6, 28);
    graphics.fillStyle(0x74c947).fillRect(-17, -17, 13, 13).fillRect(4, -17, 13, 13).fillRect(-7, -29, 14, 13);
    graphics.fillStyle(0xa6e36a).fillRect(-12, -13, 5, 5).fillRect(8, -13, 5, 5).fillRect(-3, -25, 5, 5);
  } else {
    graphics.fillStyle(0x2e733c).fillRect(-14, -7, 7, 26).fillRect(-3, -18, 7, 38).fillRect(8, -10, 7, 29);
    graphics.fillStyle(0x79ad4f).fillRect(-11, -3, 5, 14).fillRect(0, -14, 5, 18).fillRect(11, -6, 5, 16);
  }
}

export function createPlantVisual(
  scene: Phaser.Scene,
  speciesId: string,
  x: number,
  y: number,
  texturePrefix = "",
): Phaser.GameObjects.Container {
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x295f36, 0.45).fillRect(-18, 15, 38, 9);

  let artwork: Phaser.GameObjects.GameObject;
  if (isPlantSpriteSpecies(speciesId)) {
    artwork = scene.add
      .sprite(0, plantSpriteY(speciesId), plantTextureKey(speciesId, texturePrefix), 0)
      .setOrigin(0.5, 1)
      .setScale(plantSpriteScale(speciesId));
  } else {
    const fallback = scene.add.graphics();
    drawFallbackPlant(fallback, speciesId);
    artwork = fallback;
  }

  return scene.add.container(x, y, [shadow, artwork]).setDepth(5).setData("species", speciesId);
}
