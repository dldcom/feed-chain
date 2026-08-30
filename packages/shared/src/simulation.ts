import { CANONICAL_FOOD_RELATIONS, relationKey, type FoodRelation } from "./food-web.js";
import { SPECIES, type SpeciesId } from "./species.js";

export interface PopulationPoint {
  tick: number;
  populations: Partial<Record<SpeciesId, number>>;
}

export interface SimulationResult {
  removedSpecies: SpeciesId;
  timeline: PopulationPoint[];
  extinctSpecies: SpeciesId[];
  survivors: Partial<Record<SpeciesId, number>>;
}

export interface SimulationOptions {
  initial: Partial<Record<SpeciesId, number>>;
  relations?: readonly FoodRelation[];
  removedSpecies: SpeciesId;
  ticks?: number;
  seed?: number;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function simulateEcosystem(options: SimulationOptions): SimulationResult {
  const relations = options.relations ?? CANONICAL_FOOD_RELATIONS;
  const ticks = options.ticks ?? 24;
  const random = seededRandom(options.seed ?? 20260830);
  const populations: Partial<Record<SpeciesId, number>> = { ...options.initial, [options.removedSpecies]: 0 };
  const timeline: PopulationPoint[] = [{ tick: 0, populations: { ...populations } }];
  const ids = Object.keys(SPECIES) as SpeciesId[];

  for (let tick = 1; tick <= ticks; tick += 1) {
    const previous = { ...populations };
    const next = { ...populations };

    for (const id of ids) {
      if (id === options.removedSpecies) {
        next[id] = 0;
        continue;
      }

      const current = previous[id] ?? 0;
      if (current <= 0) {
        next[id] = 0;
        continue;
      }

      if (SPECIES[id].level === "producer") {
        const consumers = relations
          .filter((edge) => edge.prey === id)
          .reduce((sum, edge) => sum + (previous[edge.predator] ?? 0), 0);
        const growth = Math.max(1, Math.round(current * 0.2));
        const consumed = Math.round(consumers * 0.35 * (0.85 + random() * 0.3));
        next[id] = Math.max(0, Math.min(SPECIES[id].maxPopulation, current + growth - consumed));
        continue;
      }

      const foods = relations.filter((edge) => edge.predator === id).map((edge) => edge.prey);
      const foodSupply = foods.reduce((sum, food) => sum + (previous[food] ?? 0), 0);
      const predators = relations.filter((edge) => edge.prey === id).map((edge) => edge.predator);
      const predatorPressure = predators.reduce((sum, predator) => sum + (previous[predator] ?? 0), 0);
      const neededFood = current * 1.25;
      const foodFactor = neededFood === 0 ? 0 : foodSupply / neededFood;
      const births = foodFactor > 1.15 ? Math.max(1, Math.floor(current * 0.22 * random())) : 0;
      const starvation = foodFactor < 0.55 ? Math.max(1, Math.ceil(current * (0.3 + random() * 0.18))) : 0;
      const predation = Math.min(current, Math.floor(predatorPressure * 0.22 * random()));
      next[id] = Math.max(0, Math.min(SPECIES[id].maxPopulation, current + births - starvation - predation));
    }

    Object.assign(populations, next);
    timeline.push({ tick, populations: { ...populations } });
  }

  const extinctSpecies = ids.filter((id) => id !== options.removedSpecies && (options.initial[id] ?? 0) > 0 && (populations[id] ?? 0) === 0);
  return {
    removedSpecies: options.removedSpecies,
    timeline,
    extinctSpecies,
    survivors: { ...populations },
  };
}

export function edgesFromKeys(keys: readonly string[]): FoodRelation[] {
  const allowed = new Map(CANONICAL_FOOD_RELATIONS.map((edge) => [relationKey(edge.prey, edge.predator), edge]));
  return keys.flatMap((key) => {
    const edge = allowed.get(key);
    return edge ? [edge] : [];
  });
}

