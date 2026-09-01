export const SPECIES_FRAME_WIDTH = 304;
export const SPECIES_FRAME_HEIGHT = 352;
export const SPECIES_SPRITE_SCALE = 0.27;

export const SPRITE_SPECIES = ["rabbit", "squirrel", "snake", "weasel"] as const;

export type SpriteSpeciesId = (typeof SPRITE_SPECIES)[number];
export type SpriteDirection = "down" | "left" | "right" | "up";

interface SpeciesSpriteConfig {
  movementFile: string;
  movementTexture: string;
  sickFile: string;
  sickTexture: string;
  yOffset: number;
}

const SPECIES_SPRITES: Record<SpriteSpeciesId, SpeciesSpriteConfig> = {
  rabbit: {
    movementFile: "rabbit-jump.png",
    movementTexture: "rabbit-jump",
    sickFile: "rabbit-sick.png",
    sickTexture: "rabbit-sick",
    yOffset: 0,
  },
  squirrel: {
    movementFile: "squirrel-walk.png",
    movementTexture: "squirrel-walk",
    sickFile: "squirrel-sick.png",
    sickTexture: "squirrel-sick",
    yOffset: 5,
  },
  snake: {
    movementFile: "snake-walk.png",
    movementTexture: "snake-walk",
    sickFile: "snake-sick.png",
    sickTexture: "snake-sick",
    yOffset: 9,
  },
  weasel: {
    movementFile: "weasel-walk.png",
    movementTexture: "weasel-walk",
    sickFile: "weasel-sick.png",
    sickTexture: "weasel-sick",
    yOffset: 9,
  },
};

const DIRECTION_ROWS: Record<SpriteDirection, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

export function isSpriteSpecies(speciesId: string): speciesId is SpriteSpeciesId {
  return SPRITE_SPECIES.includes(speciesId as SpriteSpeciesId);
}

export function speciesSpriteConfig(speciesId: SpriteSpeciesId): SpeciesSpriteConfig {
  return SPECIES_SPRITES[speciesId];
}

export function movementTextureKey(speciesId: SpriteSpeciesId, prefix = ""): string {
  return `${prefix}${SPECIES_SPRITES[speciesId].movementTexture}`;
}

export function sickTextureKey(speciesId: SpriteSpeciesId, prefix = ""): string {
  return `${prefix}${SPECIES_SPRITES[speciesId].sickTexture}`;
}

export function speciesSpriteY(speciesId: SpriteSpeciesId, baseY: number): number {
  return baseY + SPECIES_SPRITES[speciesId].yOffset;
}

export function spriteDirection(facingX: number, facingY: number): SpriteDirection {
  if (Math.abs(facingX) >= Math.abs(facingY)) return facingX < 0 ? "left" : "right";
  return facingY < 0 ? "up" : "down";
}

export function spriteDirectionRow(facingX: number, facingY: number): number {
  return DIRECTION_ROWS[spriteDirection(facingX, facingY)];
}

export function movementFrame(facingX: number, facingY: number, phase = 0): number {
  return spriteDirectionRow(facingX, facingY) * 4 + Math.max(0, Math.min(3, phase));
}

export function sickFrame(facingX: number, facingY: number): number {
  return spriteDirectionRow(facingX, facingY);
}
