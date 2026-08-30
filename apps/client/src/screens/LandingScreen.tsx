import { useState } from "react";
import { createClass, joinClass } from "../network/gameClient";
import { useGameStore } from "../store/gameStore";
import { PixelSpeciesIcon } from "../components/PixelSpeciesIcon";

export function LandingScreen(): JSX.Element {
  const [mode, setMode] = useState<"home" | "student" | "teacher">("home");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const connecting = useGameStore((state) => state.connecting);
  const error = useGameStore((state) => state.error);
  const setError = useGameStore((state) => state.setError);

  const run = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "수업에 연결하지 못했어요.");
    }
  };

  return (
    <main className="landing-screen">
      <div className="sky-decoration sky-one" />
      <div className="sky-decoration sky-two" />
      <div className="forest-backdrop" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => <PixelSpeciesIcon key={index} speciesId={index % 3 === 1 ? "grass" : "berry"} />)}
      </div>
      <section className="landing-stage">
        <div className="game-logo">
          <PixelSpeciesIcon speciesId="grass" className="logo-leaf" />
          <div>
            <small>우리 반 생태 탐험</small>
            <h1>먹이그물 탐험대</h1>
          </div>
          <PixelSpeciesIcon speciesId="hawk" className="logo-hawk" />
        </div>

        {mode === "home" && (
          <div className="portal-row">
            <button className="portal-card student-portal" onClick={() => setMode("student")}>
              <PixelSpeciesIcon speciesId="frog" className="portal-character" />
              <strong>학생으로 입장</strong>
              <small>수업 코드를 입력하고 탐험 시작!</small>
            </button>
            <button className="portal-card teacher-portal" onClick={() => setMode("teacher")}>
              <PixelSpeciesIcon speciesId="hawk" className="portal-character" />
              <strong>선생님 수업 만들기</strong>
              <small>새로운 생태계 방을 열어요</small>
            </button>
          </div>
        )}

        {mode !== "home" && (
          <form
            className="game-dialog join-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              if (!nickname.trim()) return setError("탐험가 이름을 입력해 주세요.");
              if (mode === "student" && roomCode.trim().length !== 6) return setError("6자리 수업 코드를 확인해 주세요.");
              void run(() => mode === "teacher" ? createClass(nickname) : joinClass(roomCode, nickname));
            }}
          >
            <button type="button" className="back-button" onClick={() => setMode("home")}>←</button>
            <span className="dialog-icon">{mode === "teacher" ? "🦉" : "🧭"}</span>
            <h2>{mode === "teacher" ? "새 생태계 만들기" : "탐험대에 합류하기"}</h2>
            {mode === "student" && (
              <label>
                <span>수업 코드</span>
                <input
                  className="code-input"
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                  placeholder="ABC123"
                  autoComplete="off"
                />
              </label>
            )}
            <label>
              <span>{mode === "teacher" ? "선생님 이름" : "탐험가 이름"}</span>
              <input value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, 12))} placeholder={mode === "teacher" ? "김선생" : "민준"} autoComplete="off" />
            </label>
            {error && <div className="dialog-error">⚠️ {error}</div>}
            <button className="primary-game-button" disabled={connecting}>
              {connecting ? "생태계로 이동 중…" : mode === "teacher" ? "수업 열기" : "입장하기"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
