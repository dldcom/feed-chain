import { useEffect, useState, type CSSProperties } from "react";
import {
  EAT_COOLDOWN_MS,
  isGameModeId,
  isPlayableSpeciesId,
  isSpeciesId,
  modeConfig,
  SPECIES,
  type GameModeId,
  type SpeciesId,
} from "@feed-chain/shared";
import { eatNearest, useSkill } from "../network/gameClient";
import { useGameStore } from "../store/gameStore";
import { VirtualJoystick } from "./VirtualJoystick";
import { PixelSpeciesIcon } from "./PixelSpeciesIcon";

export interface GameHudTestState {
  speciesId: string;
  hunger: number;
  timeRemainingMs: number;
  roundNumber: number;
  shrinkStage: number;
  discovered: number;
  totalRelations: number;
  skillRemainingMs: number;
  eatRemainingMs: number;
  active: boolean;
  populationCount?: number;
  status?: string;
  modeId?: GameModeId | "";
  modeNumber?: number;
  modeTitle?: string;
  removedSpecies?: SpeciesId | "";
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
  const skillRemaining = testState?.skillRemainingMs ?? Math.max(0, (player?.skillReadyAt ?? 0) - now);
  const eatRemaining = testState?.eatRemainingMs ?? Math.max(0, (player?.eatReadyAt ?? 0) - now);
  const active = testState?.active ?? player?.status === "active";
  const status = testState?.status ?? player?.status ?? "active";
  const modeNumber = testState?.modeNumber ?? snapshot.modeNumber;
  const modeTitle = testState?.modeTitle ?? snapshot.modeTitle;
  const relationModeId = testState?.modeId ?? snapshot.modeId;
  const relationRemovedSpecies = testState?.removedSpecies ?? snapshot.removedSpecies;
  const relationMode = relationModeId && isGameModeId(relationModeId)
    ? modeConfig(relationModeId, isSpeciesId(relationRemovedSpecies) ? relationRemovedSpecies : undefined)
    : undefined;
  const predators = relationMode?.relations.filter((edge) => edge.prey === speciesId).map((edge) => edge.predator) ?? [];
  const foods = relationMode?.relations.filter((edge) => edge.predator === speciesId).map((edge) => edge.prey) ?? [];
  const wrongRemaining = testState?.wrongRemainingMs ?? Math.max(0, (player?.wrongUntil ?? 0) - now);
  const skillCooldown = species.skill?.cooldownMs ?? 1;
  const skillName = species.skill?.name ?? "스킬";
  const hunger = Math.max(0, Math.min(100, testState?.hunger ?? player?.hunger ?? 100));
  const hungerSegments = Math.ceil(hunger / 20);
  const hungerState = hunger <= 30 ? "low" : hunger <= 60 ? "mid" : "good";
  const cooldownStyle = (remainingMs: number, totalMs: number) => {
    const ratio = Math.max(0, Math.min(1, remainingMs / Math.max(1, totalMs)));
    return {
      // The gold sector represents the time still locked; it shrinks in
      // discrete-looking steps as the action charges back up.
      "--cooldown-angle": `${ratio * 360}deg`,
    } as CSSProperties;
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="hud-layer">
      <div className="hud-top-left">
        <div className="hud-player-card">
          <div className="avatar-chip" style={{ borderColor: species.cssColor }}>
            <PixelSpeciesIcon speciesId={speciesId} />
            <div className="player-info">
              <strong>{species.name}</strong>
              <div className="hunger-bar" aria-label={`배고픔 ${hunger}%`}>
                <img src="/assets/pixel/ui/meat-icon.png" alt="배고픔" />
                <div className="hunger-meter" data-state={hungerState}>
                  {Array.from({ length: 5 }, (_, index) => (
                    <i key={index} className={index < hungerSegments ? "active" : undefined} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="hud-relations" aria-label="먹이 관계">
          {predators.length > 0 && (
            <div className="relation-row">
              <span className="relation-label">적</span>
              <div className="relation-icons">{predators.map((id) => <span className="relation-icon-cell" key={id}><PixelSpeciesIcon speciesId={id} /></span>)}</div>
            </div>
          )}
          {foods.length > 0 && (
            <div className="relation-row">
              <span className="relation-label">먹이</span>
              <div className="relation-icons">{foods.map((id) => <span className="relation-icon-cell" key={id}><PixelSpeciesIcon speciesId={id} /></span>)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="round-timer">
        <small>{modeTitle ? `${modeNumber ? `${modeNumber}판 · ` : ""}${modeTitle}` : (testState?.roundNumber ?? snapshot.roundNumber) ? `${testState?.roundNumber ?? snapshot.roundNumber}판` : "생태계 실험"}</small>
        <strong>{formatTime(testState?.timeRemainingMs ?? snapshot.timeRemainingMs)}</strong>
        {(testState?.shrinkStage ?? snapshot.shrinkStage) > 0 && <span>서식 공간 축소 {testState?.shrinkStage ?? snapshot.shrinkStage}/2</span>}
      </div>

      <VirtualJoystick onInput={testState?.onInput} />

      <div className="action-buttons">
        <button
          className="action-button skill-button"
          aria-label={skillRemaining > 0 ? `스킬: ${skillName}, ${Math.ceil(skillRemaining / 1000)}초 남음` : `스킬: ${skillName}`}
          title={skillName}
          data-cooldown={skillRemaining > 0 ? "active" : "ready"}
          style={cooldownStyle(skillRemaining, skillCooldown)}
          onPointerDown={(event) => { event.preventDefault(); testState ? testState.onSkill() : useSkill(); }}
          disabled={skillRemaining > 0 || !active}
        >
          {skillRemaining > 0 && <i className="cooldown-sweep" />}
          <strong className="action-key">B</strong>
          {skillRemaining > 0 && <span className="cooldown-count" aria-hidden="true">{Math.ceil(skillRemaining / 1000)}</span>}
        </button>
        <button
          className="action-button eat-button"
          aria-label={eatRemaining > 0 ? `먹기, ${Math.ceil(eatRemaining / 1000)}초 남음` : "먹기"}
          title="먹기"
          data-cooldown={eatRemaining > 0 ? "active" : "ready"}
          style={cooldownStyle(eatRemaining, EAT_COOLDOWN_MS)}
          onPointerDown={(event) => { event.preventDefault(); testState ? testState.onEat() : eatNearest(); }}
          disabled={!active || wrongRemaining > 0 || eatRemaining > 0}
        >
          {eatRemaining > 0 && <i className="cooldown-sweep" />}
          <strong className="action-key">A</strong>
        </button>
      </div>

      {player?.status === "ghost" && (
        <div className="center-banner ghost-banner">
          <strong>생태 관찰자</strong>
          <small>{Math.max(0, Math.ceil((player.ghostUntil - now) / 1000))}초 뒤 같은 생물로 돌아가요</small>
        </div>
      )}
      {status === "respawning" && (
        <div className="center-banner respawn-banner">
          <strong>잠시 후 다시 나타나요</strong>
          <small>{Math.max(0, Math.ceil(((player?.respawnAt ?? 0) - now) / 1000))}초 뒤 다른 장소에서 시작해요</small>
        </div>
      )}
      {player?.status === "extinct" && <div className="center-banner ghost-banner"><strong>관찰 모드</strong><small>생태계의 변화를 살펴보세요</small></div>}
      {wrongRemaining > 0 && <div className="center-banner sick-banner"><strong>배탈!</strong><small>잠깐 움직일 수 없어요</small></div>}
      {(testState?.paused ?? snapshot.paused) && <div className="pause-curtain"><strong>잠시 멈춤</strong><small>선생님의 안내를 들어보세요</small></div>}
    </div>
  );
}
