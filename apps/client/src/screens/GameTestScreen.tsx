import { useEffect, useRef, useState } from "react";
import { GAME_MODE_IDS, SPECIES, modeConfig, type GameModeId, type PlayableSpeciesId, type SpeciesId } from "@feed-chain/shared";
import { PixelSpeciesIcon } from "../components/PixelSpeciesIcon";
import { GameHud, type GameHudTestState } from "../components/GameHud";
import { GameTestCanvas } from "../game/GameTestCanvas";
import { TESTABLE_ROLES, type GameTestScene, type GameTestStatus } from "../game/GameTestScene";

const INITIAL_STATUS: GameTestStatus = {
  speciesId: "hawk",
  skillName: SPECIES.hawk.skill.name,
  cooldownRemainingMs: 0,
  activeRemainingMs: 0,
  eatRemainingMs: 0,
  wrongRemainingMs: 0,
  hunger: 100,
  score: 0,
  discovered: 0,
  totalRelations: 1,
  timeRemainingMs: 5 * 60 * 1000,
  position: { x: 2400, y: 1500 },
  populationCount: 1,
  status: "active",
  modeId: "chain_observe",
  modeNumber: 1,
  modeTitle: modeConfig("chain_observe").title,
};

export function GameTestScreen(): JSX.Element {
  const [speciesId, setSpeciesId] = useState<PlayableSpeciesId>("hawk");
  const [modeId, setModeId] = useState<GameModeId>("chain_observe");
  const [removedSpecies, setRemovedSpecies] = useState<SpeciesId>("frog");
  const [status, setStatus] = useState(INITIAL_STATUS);
  const sceneRef = useRef<GameTestScene | null>(null);
  const selectedModeConfig = modeConfig(modeId, modeId === "web_removal" ? removedSpecies : undefined);
  const playableRoles = TESTABLE_ROLES.filter((role) => selectedModeConfig.playableSpecies.includes(role.id));

  useEffect(() => {
    if (!selectedModeConfig.playableSpecies.includes(speciesId)) {
      setSpeciesId(selectedModeConfig.playableSpecies[0] ?? "hawk");
    }
  }, [modeId, removedSpecies, selectedModeConfig, speciesId]);
  const hudState: GameHudTestState = {
    speciesId,
    hunger: status.hunger,
    score: status.score,
    timeRemainingMs: status.timeRemainingMs,
    roundNumber: status.modeNumber,
    shrinkStage: 0,
    discovered: status.discovered,
    totalRelations: status.totalRelations,
    skillRemainingMs: status.cooldownRemainingMs,
    eatRemainingMs: status.eatRemainingMs,
    active: status.status === "active",
    populationCount: status.populationCount,
    status: status.status,
    modeNumber: status.modeNumber,
    modeTitle: status.modeTitle,
    wrongRemainingMs: status.wrongRemainingMs,
    paused: false,
    onInput: (x, y) => sceneRef.current?.setVirtualInput(x, y),
    onSkill: () => sceneRef.current?.activateSkill(),
    onEat: () => sceneRef.current?.eatNearest(),
  };

  return (
    <main className="game-test-screen">
      <section className="game-test-play-area">
        <GameTestCanvas modeId={modeId} removedSpecies={modeId === "web_removal" ? removedSpecies : undefined} speciesId={speciesId} onReady={(scene) => { sceneRef.current = scene; }} onStatus={setStatus} />
        <GameHud testState={hudState} />
      </section>

      <aside className="game-test-role-panel">
        <header>
          <small>LOCAL GAME SANDBOX</small>
          <h1>역할 테스트</h1>
          <p>실제 HUD와 먹이 생태계를 그대로 두고 역할만 자유롭게 바꿉니다.</p>
        </header>
        <p className="game-test-mode-note">{selectedModeConfig.title} · 이 모드에서 플레이 가능한 역할</p>
        <div className="game-test-role-grid" role="list" aria-label="테스트할 역할 선택">
          {playableRoles.map((role) => (
            <button key={role.id} className={role.id === speciesId ? "selected" : ""} style={{ "--role-color": role.cssColor } as React.CSSProperties} onClick={() => setSpeciesId(role.id)} role="listitem">
              <PixelSpeciesIcon speciesId={role.id} />
              <span><strong>{role.name}</strong><small>{role.skill?.name}</small></span>
            </button>
          ))}
        </div>
        <div className="game-test-mode-picker">
          <strong>게임 모드</strong>
          {GAME_MODE_IDS.map((id) => {
            const mode = modeConfig(id);
            return <button key={id} className={id === modeId ? "selected" : ""} onClick={() => setModeId(id)}><b>{mode.number}</b><span>{mode.title}</span></button>;
          })}
          {modeId === "web_removal" && <div className="game-test-removal-picker"><small>사라질 종</small><div>{modeConfig("web_removal").activeSpecies.map((id) => <button key={id} className={removedSpecies === id ? "selected" : ""} onClick={() => setRemovedSpecies(id)}>{SPECIES[id].emoji}</button>)}</div></div>}
        </div>
        <div className="game-test-help">
          <strong>조작법</strong>
          <span><kbd>WASD</kbd> / <kbd>방향키</kbd> 이동</span>
          <span><kbd>Space</kbd> 스킬 사용</span>
          <span><kbd>E</kbd> 먹기</span>
        </div>
        <div className="game-test-role-summary">
          <span>현재 위치 {status.position.x}, {status.position.y}</span>
          <span>먹이 발견 {status.discovered}/{status.totalRelations}</span>
          <button onClick={() => sceneRef.current?.resetCooldown()}>↻ 스킬 쿨다운 초기화</button>
        </div>
        <a className="game-test-exit" href="/">← 메인으로 돌아가기</a>
      </aside>
    </main>
  );
}
