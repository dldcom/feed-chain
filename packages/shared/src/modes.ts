import { CANONICAL_FOOD_RELATIONS, type FoodRelation } from "./food-web.js";
import { type PlayableSpeciesId, type SpeciesId } from "./species.js";

/** The four classroom activities share one simulation but expose different rules. */
export const GAME_MODE_IDS = [
  "chain_observe",
  "chain_removal",
  "web_observe",
  "web_removal",
] as const;

export type GameModeId = (typeof GAME_MODE_IDS)[number];

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
