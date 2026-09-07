import type { GamePhase } from "./phases.js";
import type { GameModeId } from "./modes.js";
import type { PlayableSpeciesId, SkillKind, SpeciesId } from "./species.js";
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
  action: "assign_roles" | "reveal_roles" | "set_role" | "next_phase" | "pause" | "resume" | "reset" | "start_experiment" | "start_mode" | "adjust_time" | "quiz_reveal" | "quiz_next" | "reflection_finish";
  phase?: GamePhase;
  modeId?: GameModeId;
  removedSpecies?: SpeciesId;
  playerId?: string;
  species?: SpeciesId;
  deltaMs?: number;
}

export interface QuizAnswerInput {
  questionId: string;
  optionIndex: number;
}

export interface ReflectionSubmitInput {
  text: string;
}

export interface QuizAnswerSaved {
  questionIndex: number;
  optionIndex: number;
}

export interface QuizProgressEntry {
  playerId: string;
  playerName: string;
  optionIndex: number | null;
}

export interface QuizProgress {
  questionIndex: number;
  submittedCount: number;
  total: number;
  answers: QuizProgressEntry[];
}

export interface QuizReveal {
  questionIndex: number;
  correctOption: number;
  explanation: string;
}

export interface ReflectionSaved {
  submitted: boolean;
  text: string;
}

export interface ReflectionProgressEntry {
  playerId: string;
  playerName: string;
  text: string;
  submitted: boolean;
}

export interface ReflectionProgress {
  submittedCount: number;
  total: number;
  entries: ReflectionProgressEntry[];
}

export interface GameNotice {
  kind: "success" | "warning" | "info" | "skill";
  text: string;
}

/** Private role briefing sent only to the student who owns the role. */
export interface RoleBriefing {
  modeId: GameModeId | "";
  modeNumber: number;
  modeTitle: string;
  species: PlayableSpeciesId;
  foods: SpeciesId[];
  predators: SpeciesId[];
  skill: {
    id: string;
    name: string;
    kind: SkillKind;
    durationMs: number;
    cooldownMs: number;
  } | null;
  revealEndsAt: number;
}

/** The teacher may see assignments before the students do. */
export interface TeacherRoleAssignment {
  playerId: string;
  playerName: string;
  species: PlayableSpeciesId;
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
  /** Population totals for playable student roles only. */
  playerPopulations: Partial<Record<SpeciesId, number>>;
  /** Population totals for animal NPC entities. */
  npcPopulations: Partial<Record<SpeciesId, number>>;
  /** Population totals for active producer entities. */
  plantPopulations: Partial<Record<SpeciesId, number>>;
  /** Player + NPC + plant population totals. */
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
