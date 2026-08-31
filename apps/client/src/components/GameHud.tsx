import { useEffect, useState, type CSSProperties } from "react";
import { EAT_COOLDOWN_MS, foodsFor, isPlayableSpeciesId, SPECIES } from "@feed-chain/shared";
import { eatNearest, useSkill } from "../network/gameClient";
import { useGameStore } from "../store/gameStore";
import { VirtualJoystick } from "./VirtualJoystick";
import { PixelSpeciesIcon } from "./PixelSpeciesIcon";

export interface GameHudTestState {
  speciesId: string;
  hunger: number;
  score: number;
  timeRemainingMs: number;
  roundNumber: number;
  shrinkStage: number;
  discovered: number;
  totalRelations: number;
  skillRemainingMs: number;
  eatRemainingMs: number;
  active: boolean;
  wrongRemainingMs: number;
  paused: boolean;
  onInput: (x: number, y: number) => void;
  onSkill: () => void;
  onEat: () => void;
}

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function GameHud({ testState }: { testState?: GameHudTestState } = {}): JSX.Element {
  const snapshot = useGameStore((state) => state.snapshot);
  const selfId = useGameStore((state) => state.selfId);
  const [now, setNow] = useState(Date.now());
  const player = snapshot.players.find((entry) => entry.id === selfId);
  const speciesId = testState && isPlayableSpeciesId(testState.speciesId)
    ? testState.speciesId
    : player && isPlayableSpeciesId(player.species) ? player.species : "grasshopper";
  const species = SPECIES[speciesId];
  const discovered = testState?.discovered ?? snapshot.observedRelations.filter((edge) => edge.predator === speciesId).length;
  const total = testState?.totalRelations ?? foodsFor(speciesId).length;
  const skillRemaining = testState?.skillRemainingMs ?? Math.max(0, (player?.skillReadyAt ?? 0) - now);
  const eatRemaining = testState?.eatRemainingMs ?? Math.max(0, (player?.eatReadyAt ?? 0) - now);
  const active = testState?.active ?? player?.status === "active";
  const wrongRemaining = testState?.wrongRemainingMs ?? Math.max(0, (player?.wrongUntil ?? 0) - now);
  const skillCooldown = species.skill?.cooldownMs ?? 1;
  const cooldownStyle = (ratio: number) => ({ "--cooldown-angle": `${Math.max(0, Math.min(1, ratio)) * 360}deg` } as CSSProperties);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="hud-layer">
      <div className="hud-top-left">
        <div className="avatar-chip" style={{ borderColor: species.cssColor }}>
          <PixelSpeciesIcon speciesId={speciesId} />
          <div><strong>{species.name}</strong><small>{species.skill?.name}</small></div>
        </div>
        <div className="hunger-bar">
          <span>배고픔</span>
          <div><i style={{ width: `${testState?.hunger ?? player?.hunger ?? 100}%` }} /></div>
        </div>
      </div>

      <div className="round-timer">
        <small>{(testState?.roundNumber ?? snapshot.roundNumber) ? `${testState?.roundNumber ?? snapshot.roundNumber}판` : "생태계 실험"}</small>
        <strong>{formatTime(testState?.timeRemainingMs ?? snapshot.timeRemainingMs)}</strong>
        {(testState?.shrinkStage ?? snapshot.shrinkStage) > 0 && <span>⚠️ 서식 공간 축소 {testState?.shrinkStage ?? snapshot.shrinkStage}/2</span>}
      </div>

      <div className="hud-top-right">
        <div className="discovery-chip">🔗 내 관계 <strong>{discovered}/{total}</strong></div>
        <div className="score-chip">✨ {(testState?.score ?? player?.score ?? 0).toFixed(1)}</div>
      </div>

      <VirtualJoystick onInput={testState?.onInput} />

      <div className="action-buttons">
        <button className="action-button skill-button" style={cooldownStyle(skillRemaining / skillCooldown)} onPointerDown={(event) => { event.preventDefault(); testState ? testState.onSkill() : useSkill(); }} disabled={skillRemaining > 0 || !active}>
          {skillRemaining > 0 && <i className="cooldown-sweep" />}
          <span>⚡</span>
          <strong>{skillRemaining > 0 ? `${Math.ceil(skillRemaining / 1000)}초` : species.skill?.name}</strong>
        </button>
        <button className="action-button eat-button" style={cooldownStyle(eatRemaining / EAT_COOLDOWN_MS)} onPointerDown={(event) => { event.preventDefault(); testState ? testState.onEat() : eatNearest(); }} disabled={!active || wrongRemaining > 0 || eatRemaining > 0}>
          {eatRemaining > 0 && <i className="cooldown-sweep" />}
          <span>🍴</span>
          <strong>먹기</strong>
        </button>
      </div>

      {player?.status === "ghost" && (
        <div className="center-banner ghost-banner">
          <span>👻</span>
          <strong>생태 관찰자</strong>
          <small>{Math.max(0, Math.ceil((player.ghostUntil - now) / 1000))}초 뒤 같은 생물로 돌아가요</small>
        </div>
      )}
      {player?.status === "extinct" && <div className="center-banner ghost-banner"><span>🔍</span><strong>관찰 모드</strong><small>생태계의 변화를 살펴보세요</small></div>}
      {wrongRemaining > 0 && <div className="center-banner sick-banner"><span>😵</span><strong>배탈!</strong><small>잠깐 움직일 수 없어요</small></div>}
      {(testState?.paused ?? snapshot.paused) && <div className="pause-curtain"><span>⏸️</span><strong>잠시 멈춤</strong><small>선생님의 안내를 들어보세요</small></div>}
    </div>
  );
}
