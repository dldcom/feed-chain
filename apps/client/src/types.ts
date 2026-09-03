import type { ExperimentComparison, GameModeId, GamePhase, ModeResult } from "@feed-chain/shared";

export interface PlayerSnapshot {
  id: string;
  name: string;
  species: string;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  moveSpeed: number;
  boundsStage: number;
  status: string;
  score: number;
  hunger: number;
  wrongUntil: number;
  eatReadyAt: number;
  ghostUntil: number;
  skillReadyAt: number;
  skillActiveUntil: number;
  escapeUntil: number;
  shielded: boolean;
  stealth: boolean;
  connected: boolean;
  eatAttempts: number;
  successfulEats: number;
  timesEaten: number;
  survivalMs: number;
  livesEnded: number;
  populationCount: number;
  lastFoodAt: number;
  respawnAt: number;
}

export interface PlantSnapshot {
  id: string;
  species: string;
  x: number;
  y: number;
  active: boolean;
  respawnAt: number;
  populationCount: number;
}

export interface AnimalSnapshot {
  id: string;
  species: string;
  x: number;
  y: number;
  hunger: number;
  meals: number;
  status: string;
  populationCount: number;
  respawnAt: number;
  ghostUntil: number;
  lastFoodAt: number;
  breedingEnabled: boolean;
  fixed: boolean;
  extinct: boolean;
}

export interface RelationSnapshot {
  prey: string;
  predator: string;
  count: number;
}

export interface PopulationSnapshot {
  species: string;
  count: number;
  peak: number;
}

export interface IndividualRelationSnapshot {
  preyPlayerId: string;
  predatorPlayerId: string;
  preySpecies: string;
  predatorSpecies: string;
  count: number;
}

export interface GameSnapshot {
  phase: GamePhase;
  roomCode: string;
  paused: boolean;
  timeRemainingMs: number;
  shrinkStage: number;
  roundNumber: number;
  modeId: GameModeId | "";
  modeNumber: number;
  modeTitle: string;
  modeElapsedMs: number;
  removedSpecies: string;
  expectedRelations: number;
  players: PlayerSnapshot[];
  plants: PlantSnapshot[];
  animals: AnimalSnapshot[];
  populations: PopulationSnapshot[];
  observedRelations: RelationSnapshot[];
  blueRelations: RelationSnapshot[];
  individualRelations: IndividualRelationSnapshot[];
  experiment: ExperimentComparison | null;
  modeResult: ModeResult | null;
}

export const EMPTY_SNAPSHOT: GameSnapshot = {
  phase: "lobby",
  roomCode: "",
  paused: false,
  timeRemainingMs: 0,
  shrinkStage: 0,
  roundNumber: 0,
  modeId: "",
  modeNumber: 0,
  modeTitle: "",
  modeElapsedMs: 0,
  removedSpecies: "",
  expectedRelations: 0,
  players: [],
  plants: [],
  animals: [],
  populations: [],
  observedRelations: [],
  blueRelations: [],
  individualRelations: [],
  experiment: null,
  modeResult: null,
};
