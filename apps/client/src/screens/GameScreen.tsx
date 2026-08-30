import { GameCanvas } from "../game/GameCanvas";
import { GameHud } from "../components/GameHud";
import { useGameStore } from "../store/gameStore";

export function GameScreen(): JSX.Element {
  const role = useGameStore((state) => state.role);
  return (
    <main className="game-screen">
      <GameCanvas />
      {role === "student" && <GameHud />}
      {role === "teacher" && <div className="spectator-label">🦉 교사 전체 관찰 화면</div>}
    </main>
  );
}

