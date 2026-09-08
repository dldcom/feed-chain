import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { isGameModeId, isPlayableSpeciesId, isSpeciesId, modeConfig, SPECIES, type GameModeId, type PlayableSpeciesId, type SpeciesId } from "@feed-chain/shared";
import { PixelSpeciesIcon } from "../components/PixelSpeciesIcon";
import { GameHud, type GameHudTestState } from "../components/GameHud";
import { GameTestCanvas } from "../game/GameTestCanvas";
import type { GameTestScene, GameTestStatus } from "../game/GameTestScene";
import { useGameStore } from "../store/gameStore";

const DEFAULT_SPECIES: PlayableSpeciesId = "grasshopper";

function modeIdFrom(value: string, fallback: GameModeId = "chain_observe"): GameModeId {
  return isGameModeId(value) ? value : fallback;
}

function statusFor(speciesId: PlayableSpeciesId, modeId: GameModeId): GameTestStatus {
  const mode = modeConfig(modeId);
  return {
    speciesId,
    skillName: SPECIES[speciesId].skill?.name ?? "생태 관찰",
    cooldownRemainingMs: 0,
    activeRemainingMs: 0,
    eatRemainingMs: 0,
    wrongRemainingMs: 0,
    hunger: 100,
    discovered: 0,
    totalRelations: mode.relations.filter((edge) => edge.predator === speciesId || edge.prey === speciesId).length,
    timeRemainingMs: 10000,
    position: { x: 2400, y: 1500 },
    populationCount: 1,
    status: "active",
    modeId,
    modeNumber: mode.number,
    modeTitle: mode.title,
  };
}

export function RoleRevealScreen(): JSX.Element {
  const snapshot = useGameStore((state) => state.snapshot);
  const selfId = useGameStore((state) => state.selfId);
  const briefing = useGameStore((state) => state.roleBriefing);
  const fallbackPlayer = snapshot.players.find((entry) => entry.id === selfId);
  const fallbackSpecies = fallbackPlayer && isPlayableSpeciesId(fallbackPlayer.species) ? fallbackPlayer.species : DEFAULT_SPECIES;
  const speciesId = briefing?.species && isPlayableSpeciesId(briefing.species) ? briefing.species : fallbackSpecies;
  const modeId = modeIdFrom(briefing?.modeId ?? snapshot.modeId);
  const mode = modeConfig(modeId, modeId === "web_removal" && isSpeciesId(snapshot.removedSpecies) ? snapshot.removedSpecies : undefined);
  const species = SPECIES[speciesId];
  const foods = briefing?.foods ?? mode.relations.filter((edge) => edge.predator === speciesId).map((edge) => edge.prey);
  const predators = briefing?.predators ?? mode.relations.filter((edge) => edge.prey === speciesId).map((edge) => edge.predator);
  const [status, setStatus] = useState<GameTestStatus>(() => statusFor(speciesId, modeId));
  const [now, setNow] = useState(() => Date.now());
  const sceneRef = useRef<GameTestScene | null>(null);

  useEffect(() => {
    setStatus((previous) => ({ ...previous, ...statusFor(speciesId, modeId), position: previous.position }));
  }, [speciesId, modeId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  const revealEndsAt = briefing?.revealEndsAt || snapshot.roleRevealEndsAt;
  const secondsLeft = revealEndsAt > 0 ? Math.max(0, Math.ceil((revealEndsAt - now) / 1000)) : 10;
  const hudState: GameHudTestState = useMemo(() => ({
    speciesId,
    hunger: status.hunger,
    timeRemainingMs: revealEndsAt > 0 ? Math.max(0, revealEndsAt - now) : status.timeRemainingMs,
    roundNumber: status.modeNumber,
    shrinkStage: 0,
    discovered: status.discovered,
    totalRelations: status.totalRelations,
    skillRemainingMs: status.cooldownRemainingMs,
    eatRemainingMs: status.eatRemainingMs,
    active: status.status === "active",
    populationCount: status.populationCount,
    status: status.status,
    modeId,
    modeNumber: status.modeNumber,
    modeTitle: status.modeTitle,
    removedSpecies: snapshot.removedSpecies as SpeciesId | "",
    wrongRemainingMs: status.wrongRemainingMs,
    paused: false,
    onInput: (x, y) => sceneRef.current?.setVirtualInput(x, y),
    onSkill: () => sceneRef.current?.activateSkill(),
    onEat: () => sceneRef.current?.eatNearest(),
  }), [modeId, now, revealEndsAt, snapshot.removedSpecies, speciesId, status]);

  return (
    <main className="role-practice-screen">
      <header className="role-practice-header">
        <div>
          <small>{mode.number}번 게임 · 역할 학습</small>
          <h1>내 생물을 직접 움직여 봐요</h1>
        </div>
        <div className="role-countdown" aria-live="polite">
          <span>게임 시작까지</span>
          <strong>{secondsLeft}</strong>
        </div>
      </header>

      <section className="role-practice-layout">
        <div className="role-practice-stage">
          <GameTestCanvas
            speciesId={speciesId}
            modeId={modeId}
            removedSpecies={modeId === "web_removal" && isSpeciesId(snapshot.removedSpecies) ? snapshot.removedSpecies : undefined}
            onReady={(scene) => { sceneRef.current = scene; }}
            onStatus={setStatus}
          />
          <GameHud testState={hudState} />
        </div>

        <aside className="role-practice-card">
          <div className="role-practice-species" style={{ "--role-color": species.cssColor } as CSSProperties}>
            <PixelSpeciesIcon speciesId={speciesId} />
            <div><small>이번 탐험에서 나는</small><h2>{species.name}</h2></div>
          </div>

          <div className="practice-relation-grid">
            <div>
              <small>내가 먹는 생물</small>
              <div className="practice-icons">{foods.length ? foods.map((id) => <span key={id}><PixelSpeciesIcon speciesId={id} /></span>) : <em>없음</em>}</div>
            </div>
            <div>
              <small>나를 먹는 생물</small>
              <div className="practice-icons">{predators.length ? predators.map((id) => <span key={id}><PixelSpeciesIcon speciesId={id} /></span>) : <em>최상위 포식자</em>}</div>
            </div>
          </div>

          <div className="practice-skill-card">
            <small>내 스킬</small>
            <strong>{briefing?.skill?.name ?? species.skill?.name ?? "생태 관찰"}</strong>
            <p>오른쪽 아래 B 버튼 또는 Space를 눌러 보세요.</p>
          </div>
          <p className="role-practice-tip">왼쪽 조이스틱으로 움직이고, 가까운 먹이를 찾아보세요.</p>
        </aside>
      </section>
    </main>
  );
}
