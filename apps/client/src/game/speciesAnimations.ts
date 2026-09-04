export const SPECIES_FRAME_WIDTH = 304;
export const SPECIES_FRAME_HEIGHT = 352;
export const SPECIES_SPRITE_SCALE = 0.27;
export const SNATCH_DURATION_MS = 320;
export const SNATCH_FRAME_RATE = 16;

export const SPRITE_SPECIES = [
  "grasshopper", "caterpillar", "frog", "rabbit", "squirrel", "snake", "weasel", "bulbul", "duck", "hawk",
] as const;
export const SPRITE_DIRECTIONS = ["down", "left", "right", "up"] as const;

export type SpriteSpeciesId = (typeof SPRITE_SPECIES)[number];
export type SpriteDirection = (typeof SPRITE_DIRECTIONS)[number];

interface SpeciesSpriteConfig {
  movementFile: string;
  movementTexture: string;
  sickFile?: string;
  sickTexture?: string;
  snatchFile?: string;
  snatchTexture?: string;
  scale?: number;
  yOffset: number;
  snatchDrop?: number;
}

const SPECIES_SPRITES: Record<SpriteSpeciesId, SpeciesSpriteConfig> = {
  grasshopper: {
    movementFile: "grasshopper-walk.png",
    movementTexture: "grasshopper-walk",
    sickFile: "grasshopper-sick.png",
    sickTexture: "grasshopper-sick",
    yOffset: 0,
  },
  caterpillar: {
    movementFile: "caterpillar-walk.png",
    movementTexture: "caterpillar-walk",
    sickFile: "caterpillar-sick.png",
    sickTexture: "caterpillar-sick",
    scale: 0.23,
    yOffset: 6,
  },
  frog: {
    movementFile: "frog-walk.png",
    movementTexture: "frog-walk",
    sickFile: "frog-sick.png",
    sickTexture: "frog-sick",
    scale: 0.22,
    yOffset: 7,
  },
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
  bulbul: {
    movementFile: "bulbul-fly.png",
    movementTexture: "bulbul-fly",
    sickFile: "bulbul-sick.png",
    sickTexture: "bulbul-sick",
    snatchFile: "bulbul-snatch.png",
    snatchTexture: "bulbul-snatch",
    yOffset: -14,
    snatchDrop: 24,
  },
  duck: {
    movementFile: "duck-walk.png",
    movementTexture: "duck-walk",
    sickFile: "duck-sick.png",
    sickTexture: "duck-sick",
    scale: 0.20,
    yOffset: 10,
  },
  hawk: {
    movementFile: "hawk-fly.png",
    movementTexture: "hawk-fly",
    sickFile: "hawk-sick.png",
    sickTexture: "hawk-sick",
    snatchFile: "hawk-snatch.png",
    snatchTexture: "hawk-snatch",
    yOffset: -14,
    snatchDrop: 24,
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
  return `${prefix}${SPECIES_SPRITES[speciesId].sickTexture ?? `${speciesId}-sick`}`;
}

export function snatchTextureKey(speciesId: SpriteSpeciesId, prefix = ""): string {
  return `${prefix}${SPECIES_SPRITES[speciesId].snatchTexture ?? `${speciesId}-snatch`}`;
}

export function hasSickSprite(speciesId: SpriteSpeciesId): boolean {
  return Boolean(SPECIES_SPRITES[speciesId].sickFile);
}

export function speciesSpriteScale(speciesId: SpriteSpeciesId): number {
  return SPECIES_SPRITES[speciesId].scale ?? SPECIES_SPRITE_SCALE;
}

export function hasSnatchSprite(speciesId: SpriteSpeciesId): boolean {
  return Boolean(SPECIES_SPRITES[speciesId].snatchFile);
}

export function isFlyingSpriteSpecies(speciesId: string): speciesId is "bulbul" | "hawk" {
  return speciesId === "bulbul" || speciesId === "hawk";
}

export function speciesSnatchDrop(speciesId: SpriteSpeciesId): number {
  return SPECIES_SPRITES[speciesId].snatchDrop ?? 0;
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

export function snatchAnimationKey(speciesId: SpriteSpeciesId, direction: SpriteDirection, prefix = ""): string {
  return `${prefix}${speciesId}-snatch-${direction}`;
}
