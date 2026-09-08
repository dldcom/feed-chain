import { useEffect, useMemo, useRef, useState } from "react";
import { isGameModeId, isPlayableSpeciesId, isSpeciesId, modeConfig, ROLE_REVEAL_DURATION_MS, SPECIES, type GameModeId, type PlayableSpeciesId, type SpeciesId } from "@feed-chain/shared";
import { PixelSpeciesIcon } from "../components/PixelSpeciesIcon";
import { GameHud, type GameHudTestState } from "../components/GameHud";
import { GameTestCanvas } from "../game/GameTestCanvas";
import type { GameTestScene, GameTestStatus } from "../game/GameTestScene";
import { useGameStore } from "../store/gameStore";

const DEFAULT_SPECIES: PlayableSpeciesId = "grasshopper";

const TUTORIAL_STEP_DURATION_MS = ROLE_REVEAL_DURATION_MS / 4;

type TutorialRelation = "both";

interface TutorialStep {
  id: "move" | "eat" | "skill" | "relations";
  title: string;
  copy: string;
  hint?: string;
  relation?: TutorialRelation;
}

const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: "move", title: "움직여 보기", copy: "조이패드를 움직여 내 캐릭터를 움직여보세요.", hint: "키보드는 WASD 또는 방향키" },
  { id: "eat", title: "A로 먹이 먹기", copy: "먹이 가까이에서 오른쪽 아래 A 버튼을 눌러 보세요.", hint: "노란 원이 보이면 먹을 수 있어요." },
  { id: "skill", title: "B로 스킬 쓰기", copy: "오른쪽 아래 B 버튼을 눌러 내 스킬을 써 보세요.", hint: "스킬은 잠시 기다리면 다시 사용할 수 있어요." },
  { id: "relations", title: "먹이와 적 확인하기", copy: "내가 먹는 생물과 나를 먹는 생물을 확인해 보세요.", relation: "both" },
];

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
    timeRemainingMs: ROLE_REVEAL_DURATION_MS,
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
  const foods = briefing?.foods ?? mode.relations.filter((edge) => edge.predator === speciesId).map((edge) => edge.prey);
  const predators = briefing?.predators ?? mode.relations.filter((edge) => edge.prey === speciesId).map((edge) => edge.predator);
  const [status, setStatus] = useState<GameTestStatus>(() => statusFor(speciesId, modeId));
  const [now, setNow] = useState(() => Date.now());
  const sceneRef = useRef<GameTestScene | null>(null);
  const practiceStartPosition = useRef(status.position);
  const [tutorialStep, setTutorialStep] = useState(0);

  useEffect(() => {
    setStatus((previous) => ({ ...previous, ...statusFor(speciesId, modeId), position: previous.position }));
    practiceStartPosition.current = statusFor(speciesId, modeId).position;
    setTutorialStep(0);
  }, [speciesId, modeId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  const revealEndsAt = briefing?.revealEndsAt || snapshot.roleRevealEndsAt;
  const secondsLeft = revealEndsAt > 0 ? Math.max(0, Math.ceil((revealEndsAt - now) / 1000)) : ROLE_REVEAL_DURATION_MS / 1000;

  useEffect(() => {
    if (!revealEndsAt) return;
    setTutorialStep(0);
    const advanceByClock = () => {
      const elapsed = Math.max(0, ROLE_REVEAL_DURATION_MS - Math.max(0, revealEndsAt - Date.now()));
      const nextStep = Math.min(TUTORIAL_STEPS.length - 1, Math.floor(elapsed / TUTORIAL_STEP_DURATION_MS));
      setTutorialStep((current) => Math.max(current, nextStep));
    };
    advanceByClock();
    const timer = window.setInterval(advanceByClock, 250);
    return () => window.clearInterval(timer);
  }, [revealEndsAt]);

  const activeTutorial = TUTORIAL_STEPS[tutorialStep] ?? TUTORIAL_STEPS[0]!;
  const movedDuringPractice = Math.hypot(status.position.x - practiceStartPosition.current.x, status.position.y - practiceStartPosition.current.y) > 20;
  const tutorialDone = activeTutorial.id === "move"
    ? movedDuringPractice
    : activeTutorial.id === "eat"
      ? status.discovered > 0
      : activeTutorial.id === "skill"
        ? status.cooldownRemainingMs > 0 || status.activeRemainingMs > 0
        : false;
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
          <h1>{secondsLeft}초 후 게임이 시작됩니다</h1>
        </div>
        <div className="role-countdown" aria-live="polite">
          <span>연습 남은 시간</span>
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
          <div className="role-tutorial" data-step={activeTutorial.id} aria-live="polite">
            <div className="role-tutorial-head">
              <div className="role-tutorial-dots" aria-label="연습 단계">
                {TUTORIAL_STEPS.map((step, index) => (
                  <i key={step.id} className={index === tutorialStep ? "active" : index < tutorialStep ? "passed" : undefined} />
                ))}
              </div>
              <span>{tutorialStep + 1} / {TUTORIAL_STEPS.length}</span>
            </div>
            <strong>{activeTutorial.title}</strong>
            <p>{activeTutorial.copy}</p>
            {activeTutorial.relation && (
              <div className="role-tutorial-relation-groups">
                <div>
                  <small>나를 먹는 생물</small>
                  <div className="role-tutorial-relations">
                    {predators.length > 0 ? predators.map((id, index) => (
                      <span className="role-tutorial-species-cell" key={`${id}-${index}`}><PixelSpeciesIcon speciesId={id} /><b>{SPECIES[id].name}</b></span>
                    )) : <em>천적이 없어요</em>}
                  </div>
                </div>
                <div>
                  <small>내가 먹는 생물</small>
                  <div className="role-tutorial-relations">
                    {foods.length > 0 ? foods.map((id, index) => (
                      <span className="role-tutorial-species-cell" key={`${id}-${index}`}><PixelSpeciesIcon speciesId={id} /><b>{SPECIES[id].name}</b></span>
                    )) : <em>먹이가 아직 없어요</em>}
                  </div>
                </div>
              </div>
            )}
            {activeTutorial.hint && <small>{activeTutorial.hint}</small>}
            <div className="role-tutorial-actions">
              {tutorialDone && <span className="role-tutorial-done">확인했어요</span>}
              {tutorialStep < TUTORIAL_STEPS.length - 1 && (
                <button type="button" onClick={() => setTutorialStep((current) => Math.min(TUTORIAL_STEPS.length - 1, current + 1))}>다음</button>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
