import { lazy, Suspense, useEffect } from "react";
import { isActivePlayPhase, isWebPhase, PHASE_LABELS } from "@feed-chain/shared";
import { NoticeToast } from "./components/NoticeToast";
import { RotateNotice } from "./components/RotateNotice";
import { FullscreenButton } from "./components/FullscreenButton";
import { reconnectClass } from "./network/gameClient";
import { IntermissionScreen } from "./screens/IntermissionScreen";
import { LandingScreen } from "./screens/LandingScreen";
import { RoleRevealScreen } from "./screens/RoleRevealScreen";
import { TeacherLobbyScreen } from "./screens/TeacherLobbyScreen";
import { TeacherPanel } from "./screens/TeacherPanel";
import { useGameStore } from "./store/gameStore";

const GameScreen = lazy(() => import("./screens/GameScreen").then((module) => ({ default: module.GameScreen })));
const FoodWebScreen = lazy(() => import("./screens/FoodWebScreen").then((module) => ({ default: module.FoodWebScreen })));
const ExperimentPlaybackScreen = lazy(() => import("./screens/ExperimentScreen").then((module) => ({ default: module.ExperimentPlaybackScreen })));
const FinalResultsScreen = lazy(() => import("./screens/ExperimentScreen").then((module) => ({ default: module.FinalResultsScreen })));
const ModeResultScreen = lazy(() => import("./screens/ExperimentScreen").then((module) => ({ default: module.ModeResultScreen })));
const Mode4ReviewScreen = lazy(() => import("./screens/Mode4ReviewScreen").then((module) => ({ default: module.Mode4ReviewScreen })));
const GameTestScreen = lazy(() => import("./screens/GameTestScreen").then((module) => ({ default: module.GameTestScreen })));

function CurrentScreen(): JSX.Element {
  const snapshot = useGameStore((state) => state.snapshot);
  const role = useGameStore((state) => state.role);
  if (snapshot.phase === "lobby") {
    return role === "teacher"
      ? <IntermissionScreen title="새로운 생태계를 열었어요" copy="학생들이 수업 코드로 들어오면 탐험을 시작할 수 있어요." />
      : <IntermissionScreen title="학생 대기중" copy={`${snapshot.players.length}명이 모였어요.`} />;
  }
  if (snapshot.phase === "role_reveal") return role === "student" ? <RoleRevealScreen /> : <IntermissionScreen title="역할을 확인하는 중" copy="학생들이 자신의 먹이 관계를 살펴보고 있어요." />;
  if (isActivePlayPhase(snapshot.phase)) return <GameScreen />;
  if (snapshot.phase === "mode_result") return <ModeResultScreen />;
  if (snapshot.phase === "mode4_quiz" || snapshot.phase === "mode4_reflection" || snapshot.phase === "lesson_complete") return <Mode4ReviewScreen />;
  if (isWebPhase(snapshot.phase)) return <FoodWebScreen />;
  if (snapshot.phase === "mode_setup") return <IntermissionScreen title="게임 모드를 준비하고 있어요" copy={role === "teacher" ? "오른쪽 교사 패널에서 네 가지 활동 중 하나를 선택하세요." : "선생님이 오늘 관찰할 먹이사슬 또는 먹이그물을 고르고 있어요."} />;
  if (snapshot.phase === "experiment_setup") return <IntermissionScreen title="생태계 변화 실험" copy={role === "teacher" ? "오른쪽에서 사라질 생물을 선택하세요." : "어떤 생물이 사라질지 선생님과 함께 정해 보세요."} />;
  if (snapshot.phase === "experiment_b") return <ExperimentPlaybackScreen />;
  if (snapshot.phase === "final_results") return <FinalResultsScreen />;
  return <IntermissionScreen title={PHASE_LABELS[snapshot.phase]} copy="다음 활동을 준비하고 있어요." />;
}

export default function App(): JSX.Element {
  const room = useGameStore((state) => state.room);
  const role = useGameStore((state) => state.role);
  const phase = useGameStore((state) => state.snapshot.phase);
  const connecting = useGameStore((state) => state.connecting);
  const setConnecting = useGameStore((state) => state.setConnecting);
  const isGameTest = window.location.pathname === "/game-test";
  const isTeacherLobby = role === "teacher" && (phase === "lobby" || phase === "mode_setup" || phase === "role_reveal");
  const isTeacherResult = role === "teacher" && phase === "mode_result";
  const isTeacherReview = role === "teacher" && (phase === "mode4_quiz" || phase === "mode4_reflection" || phase === "lesson_complete");
  const hasStudentGameHud = role === "student" && (phase === "role_reveal" || isActivePlayPhase(phase));
  const hasTeacherPanel = role === "teacher" && !isTeacherLobby && !isTeacherResult && !isTeacherReview;

  useEffect(() => {
    if (!isGameTest && !room && sessionStorage.getItem("feed-chain-reconnection")) {
      setConnecting(true);
      void reconnectClass().finally(() => setConnecting(false));
    }
  }, []);

  if (isGameTest) {
    return <Suspense fallback={<IntermissionScreen title="테스트 맵을 펼치는 중" copy="역할과 스킬을 준비하고 있어요." />}><GameTestScreen /></Suspense>;
  }

  if (!room) return <><LandingScreen />{connecting && <div className="reconnect-cover">생태계로 다시 연결 중…</div>}<RotateNotice /></>;

  return (
    <div className={`app-shell ${role === "teacher" ? "teacher-mode" : "student-mode"} ${isTeacherResult || isTeacherReview ? "result-fullscreen" : ""} ${hasStudentGameHud ? "has-game-hud" : ""} ${hasTeacherPanel ? "has-teacher-panel" : ""}`}>
      <FullscreenButton />
      <div className={isTeacherLobby ? "teacher-lobby-slot" : "screen-slot"}>
        <Suspense fallback={<IntermissionScreen title="생태계를 펼치는 중" copy="곧 탐험이 시작돼요." />}>
          {isTeacherLobby ? <TeacherLobbyScreen /> : <CurrentScreen />}
        </Suspense>
      </div>
      {role === "teacher" && !isTeacherLobby && !isTeacherResult && !isTeacherReview && <TeacherPanel />}
      <NoticeToast />
      <RotateNotice />
    </div>
  );
}
