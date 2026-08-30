import type { ExperimentComparison, GamePhase } from "@feed-chain/shared";

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
}

export interface PlantSnapshot {
  id: string;
  species: string;
  x: number;
  y: number;
  active: boolean;
  respawnAt: number;
}

export interface AnimalSnapshot {
  id: string;
  species: string;
  x: number;
  y: number;
  hunger: number;
  meals: number;
}

export interface RelationSnapshot {
  prey: string;
  predator: string;
  count: number;
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
  removedSpecies: string;
  expectedRelations: number;
  players: PlayerSnapshot[];
  plants: PlantSnapshot[];
  animals: AnimalSnapshot[];
  observedRelations: RelationSnapshot[];
  blueRelations: RelationSnapshot[];
  individualRelations: IndividualRelationSnapshot[];
  experiment: ExperimentComparison | null;
}

export const EMPTY_SNAPSHOT: GameSnapshot = {
  phase: "lobby",
  roomCode: "",
  paused: false,
  timeRemainingMs: 0,
  shrinkStage: 0,
  roundNumber: 0,
  removedSpecies: "",
  expectedRelations: 0,
  players: [],
  plants: [],
  animals: [],
  observedRelations: [],
  blueRelations: [],
  individualRelations: [],
  experiment: null,
};
