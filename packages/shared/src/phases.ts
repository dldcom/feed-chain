export const GAME_PHASES = [
  "lobby",
  "role_reveal",
  "round_1",
  "web_review_1",
  "round_2",
  "web_review_2",
  "experiment_setup",
  "experiment_a",
  "experiment_b",
  "final_results",
] as const;

export type GamePhase = (typeof GAME_PHASES)[number];

export const PHASE_LABELS: Record<GamePhase, string> = {
  lobby: "친구들을 기다리는 중",
  role_reveal: "나의 생물 확인",
  round_1: "먹이 관계 탐색 1판",
  web_review_1: "첫 번째 먹이그물",
  round_2: "먹이 관계 탐색 2판",
  web_review_2: "완성하는 먹이그물",
  experiment_setup: "생태계 변화 준비",
  experiment_a: "실험 A · 실제 기록 관계",
  experiment_b: "실험 B · 완성된 먹이그물",
  final_results: "생태계 비교 결과",
};

export const ACTIVE_PLAY_PHASES: readonly GamePhase[] = [
  "round_1",
  "round_2",
  "experiment_a",
];

export function isActivePlayPhase(phase: GamePhase): boolean {
  return ACTIVE_PLAY_PHASES.includes(phase);
}

export function isWebPhase(phase: GamePhase): boolean {
  return phase === "web_review_1" || phase === "web_review_2";
}

export function nextPhase(phase: GamePhase): GamePhase {
  const index = GAME_PHASES.indexOf(phase);
  return GAME_PHASES[Math.min(index + 1, GAME_PHASES.length - 1)] ?? "final_results";
}

