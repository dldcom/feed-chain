import { CANONICAL_FOOD_RELATIONS, type FoodRelation } from "./food-web.js";
import { SPECIES, type PlayableSpeciesId, type SpeciesId, type TrophicLevel } from "./species.js";

/** The four classroom activities share one simulation but expose different rules. */
export const GAME_MODE_IDS = [
  "chain_observe",
  "chain_removal",
  "web_observe",
  "web_removal",
] as const;

export type GameModeId = (typeof GAME_MODE_IDS)[number];

/** One teacher plus up to twenty-four student players fit in a room. */
export const MAX_STUDENT_COUNT = 24;

export interface RoleQuota {
  apex: number;
  secondary: number;
  primary: number;
}

export interface ModeNpcConfig {
  species: PlayableSpeciesId;
  count: number;
  /** Whether an NPC can create another NPC after eating enough food. */
  breedingEnabled: boolean;
  /** Some experiments intentionally keep a species at zero after extinction. */
  respawnWhenExtinct: boolean;
}

export interface GameModeConfig {
  id: GameModeId;
  number: 1 | 2 | 3 | 4;
  title: string;
  kind: "chain" | "web";
  durationMs: number;
  /** Player roles offered by the teacher for this mode. */
  playableSpecies: readonly PlayableSpeciesId[];
  /** Producers shown and spawned as food in the map. */
  producerSpecies: readonly SpeciesId[];
  /** All species that can appear in the world, including NPCs. */
  activeSpecies: readonly SpeciesId[];
  relations: readonly FoodRelation[];
  removedSpecies?: SpeciesId;
  /** A value of zero disables starvation for the mode. */
  starvationTimeoutMs: number;
  respawnDelayMs: number;
  /** Respawn delay when the one-minute starvation rule ends a life. */
  starvationRespawnDelayMs: number;
  ghostDurationMs: number;
  plantRespawnMs: number;
  plantCounts: Partial<Record<SpeciesId, number>>;
  npc: readonly ModeNpcConfig[];
  /** Maximum number of plant entities created by the mode. */
  maxPlantEntities: number;
}

function quotaFor(total: number, apex: number, secondary: number): RoleQuota {
  const count = Math.max(0, Math.floor(total));
  const apexCount = Math.min(count, Math.max(0, apex));
  const secondaryCount = Math.min(Math.max(0, count - apexCount), Math.max(0, secondary));
  return {
    apex: apexCount,
    secondary: secondaryCount,
    primary: Math.max(0, count - apexCount - secondaryCount),
  };
}

/** Reference class-sized ratios (all three ratios add up to 23 seats). */
const STANDARD_ROLE_RATIOS: Record<GameModeId, RoleQuota> = {
  chain_observe: { apex: 2, secondary: 6, primary: 15 },
  chain_removal: { apex: 3, secondary: 0, primary: 20 },
  web_observe: { apex: 3, secondary: 7, primary: 13 },
  web_removal: { apex: 3, secondary: 7, primary: 13 },
};

function proportionalSmallQuota(modeId: GameModeId, playerCount: number): RoleQuota {
  const count = Math.max(0, Math.floor(playerCount));
  if (!count) return { apex: 0, secondary: 0, primary: 0 };
  const ratio = STANDARD_ROLE_RATIOS[modeId];
  let apex = Math.round((count * ratio.apex) / 23);
  let secondary = Math.round((count * ratio.secondary) / 23);

  // With only a few students, keep the top of the chain represented once it
  // is possible to do so. A one-student preview stays at the primary level so
  // that the student can still find and eat a producer.
  if (count >= 2 && ratio.apex > 0) apex = Math.max(1, apex);
  if (count >= 3 && ratio.secondary > 0) secondary = Math.max(1, secondary);
  if (apex + secondary > count) secondary = Math.max(0, count - apex);
  return { apex, secondary, primary: Math.max(0, count - apex - secondary) };
}

/**
 * Keep the food-web pressure stable when a class has 21–24 students.
 * Producers are NPCs, so student roles intentionally favour lower trophic
 * levels instead of assigning every playable species the same number of seats.
 */
export function roleQuotaForMode(modeId: GameModeId, playerCount: number): RoleQuota {
  const count = Math.max(0, Math.floor(playerCount));
  if (count < 21) return proportionalSmallQuota(modeId, count);
  if (modeId === "chain_observe") {
    return quotaFor(count, 2, count >= 24 ? 7 : 6);
  }
  if (modeId === "chain_removal") {
    // The single frog is an NPC in this mode; keep a small hawk group so it
    // can be observed without immediately overwhelming that NPC.
    return quotaFor(count, 3, 0);
  }
  // Web modes: 3 apex / 6–7 secondary / the rest primary consumers.
  return quotaFor(count, 3, count >= 22 ? 7 : 6);
}

/** Build a balanced role slot list, then let the server shuffle students into it. */
export function roleSlotsForMode(mode: Pick<GameModeConfig, "id" | "playableSpecies">, playerCount: number): PlayableSpeciesId[] {
  const count = Math.max(0, Math.floor(playerCount));
  if (!count || !mode.playableSpecies.length) return [];
  const quota = roleQuotaForMode(mode.id, playerCount);
  const quotas: Record<Exclude<TrophicLevel, "producer">, number> = {
    apex: quota.apex,
    secondary: quota.secondary,
    primary: quota.primary,
  };
  const slots: PlayableSpeciesId[] = [];
  (Object.keys(quotas) as Array<Exclude<TrophicLevel, "producer">>).forEach((level) => {
    const species = mode.playableSpecies.filter((speciesId) => SPECIES[speciesId].level === level);
    if (!species.length) return;
    for (let index = 0; index < quotas[level]; index += 1) {
      slots.push(species[index % species.length]!);
    }
  });
  // If a future mode removes every species from one trophic level, keep the
  // slot list the same length by redistributing the missing seats safely.
  for (let index = slots.length; index < count; index += 1) {
    slots.push(mode.playableSpecies[index % mode.playableSpecies.length]!);
  }
  return slots;
}

const chainSpecies: readonly SpeciesId[] = ["hawk", "frog", "caterpillar", "clover"];
const chainPlayers: readonly PlayableSpeciesId[] = ["hawk", "frog", "caterpillar"];
const webPlayers: readonly PlayableSpeciesId[] = [
  "hawk", "squirrel", "snake", "bulbul", "weasel", "grasshopper", "duck", "frog", "rabbit", "caterpillar",
];
const webProducers: readonly SpeciesId[] = ["acorn", "grass", "berry", "clover"];

function relationsFor(species: readonly SpeciesId[]): FoodRelation[] {
  const included = new Set(species);
  return CANONICAL_FOOD_RELATIONS.filter((edge) => included.has(edge.prey) && included.has(edge.predator));
}

export const GAME_MODE_CONFIGS: Record<GameModeId, GameModeConfig> = {
  chain_observe: {
    id: "chain_observe",
    number: 1,
    title: "먹이사슬 관찰",
    kind: "chain",
    durationMs: 5 * 60 * 1000,
    playableSpecies: chainPlayers,
    producerSpecies: ["clover"],
    activeSpecies: chainSpecies,
    relations: relationsFor(chainSpecies),
    starvationTimeoutMs: 0,
    respawnDelayMs: 3000,
    starvationRespawnDelayMs: 10000,
    ghostDurationMs: 10000,
    plantRespawnMs: 5000,
    plantCounts: { clover: 28 },
    npc: [],
    maxPlantEntities: 36,
  },
  chain_removal: {
    id: "chain_removal",
    number: 2,
    title: "먹이사슬에서 개구리가 사라진다면?",
    kind: "chain",
    durationMs: 3 * 60 * 1000,
    playableSpecies: ["hawk", "caterpillar"],
    producerSpecies: ["clover"],
    activeSpecies: chainSpecies,
    relations: relationsFor(chainSpecies),
    removedSpecies: "frog",
    starvationTimeoutMs: 60 * 1000,
    respawnDelayMs: 3000,
    starvationRespawnDelayMs: 10000,
    ghostDurationMs: 10000,
    plantRespawnMs: 5000,
    plantCounts: { clover: 28 },
    npc: [{ species: "frog", count: 1, breedingEnabled: true, respawnWhenExtinct: true }],
    maxPlantEntities: 36,
  },
  web_observe: {
    id: "web_observe",
    number: 3,
    title: "먹이그물 관찰",
    kind: "web",
    durationMs: 5 * 60 * 1000,
    playableSpecies: webPlayers,
    producerSpecies: webProducers,
    activeSpecies: [...webPlayers, ...webProducers],
    relations: relationsFor([...webPlayers, ...webProducers]),
    starvationTimeoutMs: 0,
    respawnDelayMs: 3000,
    starvationRespawnDelayMs: 10000,
    ghostDurationMs: 10000,
    plantRespawnMs: 5000,
    plantCounts: { acorn: 18, grass: 22, berry: 14, clover: 24 },
    npc: [],
    maxPlantEntities: 90,
  },
  web_removal: {
    id: "web_removal",
    number: 4,
    title: "먹이그물에서 한 종이 사라진다면?",
    kind: "web",
    durationMs: 3 * 60 * 1000,
    playableSpecies: webPlayers,
    producerSpecies: webProducers,
    activeSpecies: [...webPlayers, ...webProducers],
    relations: relationsFor([...webPlayers, ...webProducers]),
    starvationTimeoutMs: 60 * 1000,
    respawnDelayMs: 3000,
    starvationRespawnDelayMs: 10000,
    ghostDurationMs: 10000,
    plantRespawnMs: 5000,
    plantCounts: { acorn: 18, grass: 22, berry: 14, clover: 24 },
    npc: [],
    maxPlantEntities: 90,
  },
};

export function modeConfig(modeId: GameModeId, removedSpecies?: SpeciesId): GameModeConfig {
  const base = GAME_MODE_CONFIGS[modeId];
  if (modeId !== "web_removal" || !removedSpecies || !base.activeSpecies.includes(removedSpecies)) return base;

  const activeSpecies = base.activeSpecies.filter((id) => id !== removedSpecies);
  const playableSpecies = base.playableSpecies.filter((id) => id !== removedSpecies);
  const producerSpecies = base.producerSpecies.filter((id) => id !== removedSpecies);
  const plantCounts = { ...base.plantCounts };
  delete plantCounts[removedSpecies];
  const relations = base.relations.filter((edge) => edge.prey !== removedSpecies && edge.predator !== removedSpecies);
  return { ...base, removedSpecies, activeSpecies, playableSpecies, producerSpecies, plantCounts, relations };
}

export function isGameModeId(value: string): value is GameModeId {
  return GAME_MODE_IDS.includes(value as GameModeId);
}

export function modeLabel(modeId: GameModeId): string {
  return GAME_MODE_CONFIGS[modeId].title;
}
