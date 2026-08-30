import type { GamePhase } from "./phases.js";
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
  action: "assign_roles" | "reveal_roles" | "set_role" | "next_phase" | "pause" | "resume" | "reset" | "start_experiment" | "adjust_time";
  phase?: GamePhase;
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
  kind: "eat" | "wrong" | "blocked" | "skill" | "respawn";
  actorId: string;
  targetId?: string;
  skillId?: string;
}

export interface ExperimentComparison {
  a: SimulationResult;
  b: SimulationResult;
}
