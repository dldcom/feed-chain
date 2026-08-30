import { SPECIES, type SpeciesId } from "./species.js";

export interface FoodRelation {
  prey: SpeciesId;
  predator: SpeciesId;
}

// 화살표 방향은 먹이(에너지 공급원) → 먹는 생물이다.
export const CANONICAL_FOOD_RELATIONS: readonly FoodRelation[] = [
  { prey: "grass", predator: "grasshopper" },
  { prey: "grass", predator: "caterpillar" },
  { prey: "grass", predator: "rabbit" },
  { prey: "berry", predator: "squirrel" },
  { prey: "berry", predator: "bulbul" },
  { prey: "grasshopper", predator: "frog" },
  { prey: "grasshopper", predator: "bulbul" },
  { prey: "grasshopper", predator: "duck" },
  { prey: "caterpillar", predator: "frog" },
  { prey: "caterpillar", predator: "bulbul" },
  { prey: "caterpillar", predator: "duck" },
  { prey: "frog", predator: "snake" },
  { prey: "frog", predator: "duck" },
  { prey: "frog", predator: "weasel" },
  { prey: "frog", predator: "hawk" },
  { prey: "rabbit", predator: "weasel" },
  { prey: "rabbit", predator: "hawk" },
  { prey: "squirrel", predator: "weasel" },
  { prey: "squirrel", predator: "hawk" },
  { prey: "bulbul", predator: "weasel" },
  { prey: "bulbul", predator: "hawk" },
  { prey: "duck", predator: "weasel" },
  { prey: "duck", predator: "hawk" },
  { prey: "snake", predator: "hawk" },
];

export function relationKey(prey: string, predator: string): string {
  return `${prey}->${predator}`;
}

const RELATION_KEYS = new Set(CANONICAL_FOOD_RELATIONS.map(({ prey, predator }) => relationKey(prey, predator)));

export function canEat(predator: string, prey: string): boolean {
  return RELATION_KEYS.has(relationKey(prey, predator));
}

export function foodsFor(predator: SpeciesId): SpeciesId[] {
  return CANONICAL_FOOD_RELATIONS.filter((edge) => edge.predator === predator).map((edge) => edge.prey);
}

export function predatorsFor(prey: SpeciesId): SpeciesId[] {
  return CANONICAL_FOOD_RELATIONS.filter((edge) => edge.prey === prey).map((edge) => edge.predator);
}

export function relationDescription(prey: SpeciesId, predator: SpeciesId): string {
  return `${SPECIES[prey].name} → ${SPECIES[predator].name}`;
}

