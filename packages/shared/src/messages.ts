import type { GamePhase } from "./phases.js";
import type { GameModeId } from "./modes.js";
import type { SpeciesId } from "./species.js";
import type { SimulationResult } from "./simulation.js";

export interface EatInput {
  targetId: string;
  facingX: number;
  facingY: number;
}

export interface BlueEdgeInput {
  prey: SpeciesId;
  predator: SpeciesId;
}

export interface TeacherCommand {
  action: "assign_roles" | "reveal_roles" | "set_role" | "next_phase" | "pause" | "resume" | "reset" | "start_experiment" | "start_mode" | "adjust_time";
  phase?: GamePhase;
  modeId?: GameModeId;
  removedSpecies?: SpeciesId;
  playerId?: string;
  species?: SpeciesId;
  deltaMs?: number;
}

export interface GameNotice {
  kind: "success" | "warning" | "info" | "skill";
  text: string;
}

export interface ActionEffect {
  kind: "eat" | "wrong" | "blocked" | "skill" | "respawn" | "population";
  actorId: string;
  targetId?: string;
  skillId?: string;
  delta?: number;
  species?: SpeciesId;
}

export interface ExperimentComparison {
  a: SimulationResult;
  b: SimulationResult;
}

export interface ModeTimelinePoint {
  elapsedMs: number;
  populations: Partial<Record<SpeciesId, number>>;
}

export interface ModePlayerResult {
  id: string;
  name: string;
  species: SpeciesId;
  finalPopulation: number;
  successfulEats: number;
  timesEaten: number;
  survivalMs: number;
  livesEnded: number;
}

export interface ModeResult {
  modeId: GameModeId;
  modeNumber: number;
  removedSpecies: SpeciesId | "";
  durationMs: number;
  finalPopulations: Partial<Record<SpeciesId, number>>;
  peakPopulations: Partial<Record<SpeciesId, number>>;
  timeline: ModeTimelinePoint[];
  players: ModePlayerResult[];
  observedRelations: RelationRecord[];
}

export interface RelationRecord {
  prey: SpeciesId;
  predator: SpeciesId;
  count: number;
}
