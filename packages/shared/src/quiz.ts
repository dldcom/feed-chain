/**
 * Mode 4 reflection materials.  The answer key stays in the shared package
 * so the teacher and server use exactly the same wording; students only see
 * the correct option after the teacher reveals it.
 */
export type QuizQuestionKind = "text" | "choice";

export interface QuizQuestion {
  id: string;
  kind: QuizQuestionKind;
  prompt: string;
  explanation: string;
  options: readonly string[];
  correctOption: number;
  correctAnswer?: string;
}

export const MODE4_QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  {
    id: "food-chain-name",
    kind: "text",
    prompt: "풀 → 애벌레 → 개구리 → 매가 한 줄로 이어진 것은 먹이 ______이다.",
    explanation: "생물이 먹고 먹히는 관계가 한 줄로 이어진 것을 먹이사슬이라고 해요.",
    options: [],
    correctOption: 0,
    correctAnswer: "사슬",
  },
  {
    id: "food-web-name",
    kind: "text",
    prompt: "여러 먹이사슬이 서로 얽혀 있는 것은 먹이 ______이다.",
    explanation: "여러 먹이사슬이 서로 연결된 것을 먹이그물이라고 해요.",
    options: [],
    correctOption: 0,
    correctAnswer: "그물",
  },
  {
    id: "frog-missing-chain",
    kind: "choice",
    prompt: "토끼풀 → 애벌레 → 개구리 → 매 먹이사슬에서 개구리가 사라지면 어떻게 될까요?",
    explanation: "개구리가 사라지면 애벌레를 먹는 생물이 줄어 애벌레가 많아지고, 매도 먹이를 찾기 어려워져 줄어들어요.",
    options: [
      "매가 줄어들고, 애벌레가 많아져요.",
      "매가 많아지고, 애벌레가 줄어들어요.",
      "매와 애벌레가 모두 많아져요.",
      "아무것도 달라지지 않아요.",
    ],
    correctOption: 0,
  },
  {
    id: "web-species-missing",
    kind: "choice",
    prompt: "먹이그물에서 한 종류의 생물이 사라지면 어떻게 될까요?",
    explanation: "먹이그물에는 여러 먹이 관계가 있어서 다른 먹이를 이용하며 생태계가 유지될 수 있어요.",
    options: [
      "다른 먹이가 있어서 생태계가 유지돼요.",
      "모든 생물이 사라져요.",
      "생물 수가 모두 같아져요.",
      "사라진 생물이 바로 돌아와요.",
    ],
    correctOption: 0,
  },
] as const;

export const MODE4_REFLECTION_PROMPT = "이 활동으로 느낀 점, 알게 된 점을 30자 이상 써 보세요.";
export const MODE4_REFLECTION_MIN_LENGTH = 30;
