import { useEffect, useMemo, useState } from "react";
import { SPECIES, isGameModeId, isSpeciesId, modeConfig, type ModeResult, type PlayableSpeciesId, type SimulationResult, type SpeciesId } from "@feed-chain/shared";
import { useGameStore } from "../store/gameStore";
import { IntermissionScreen } from "./IntermissionScreen";

function PopulationBoard({ result, tick, label, color }: { result: SimulationResult; tick: number; label: string; color: string }): JSX.Element {
  const point = result.timeline[Math.min(tick, result.timeline.length - 1)] ?? result.timeline[0];
  const ids = (Object.keys(point?.populations ?? {}) as SpeciesId[]).filter((id) => (result.timeline[0]?.populations[id] ?? 0) > 0 || id === result.removedSpecies);
  return (
    <section className="population-board" style={{ borderColor: color }}>
      <header><small>{label}</small><strong>{tick === 0 ? "실험 시작" : `${tick}단계 변화`}</strong></header>
      <div className="population-grid">
        {ids.map((id) => {
          const count = point?.populations[id] ?? 0;
          return <div key={id} className={count === 0 ? "extinct" : ""}><span>{SPECIES[id].emoji}</span><small>{SPECIES[id].name}</small><strong>{count}</strong></div>;
        })}
      </div>
    </section>
  );
}

function TrendChart({ result, color }: { result: SimulationResult; color: string }): JSX.Element {
  const speciesIds = (Object.keys(result.timeline[0]?.populations ?? {}) as SpeciesId[]).filter((id) => id !== "grass" && id !== "berry");
  const width = 520;
  const height = 210;
  const max = Math.max(1, ...result.timeline.flatMap((point) => speciesIds.map((id) => point.populations[id] ?? 0)));
  return (
    <div className="trend-wrap">
      <div className="trend-legend">{speciesIds.map((id) => <span key={id}><i style={{ background: SPECIES[id].cssColor || color }} />{SPECIES[id].emoji} {SPECIES[id].name}</span>)}</div>
      <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`}>
        {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="30" x2={width - 10} y1={20 + line * 42} y2={20 + line * 42} stroke="#ffffff22" />)}
        {speciesIds.map((id) => {
          const points = result.timeline.map((point, index) => `${30 + (index / Math.max(1, result.timeline.length - 1)) * (width - 50)},${height - 20 - ((point.populations[id] ?? 0) / max) * (height - 40)}`).join(" ");
          return <polyline key={id} points={points} fill="none" stroke={SPECIES[id].cssColor || color} strokeWidth="4" opacity="0.9" />;
        })}
      </svg>
    </div>
  );
}

export function ExperimentPlaybackScreen(): JSX.Element {
  const comparison = useGameStore((state) => state.snapshot.experiment);
  const removed = useGameStore((state) => state.snapshot.removedSpecies);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!comparison) return;
    const max = Math.max(comparison.a.timeline.length, comparison.b.timeline.length) - 1;
    const timer = window.setInterval(() => setTick((value) => value >= max ? 0 : value + 1), 700);
    return () => window.clearInterval(timer);
  }, [comparison]);

  if (!comparison) return <IntermissionScreen icon="🧪" title="비교 실험을 준비하고 있어요" copy="잠시만 기다려 주세요." />;
  const species = isSpeciesId(removed) ? SPECIES[removed] : SPECIES.frog;
  return (
    <main className="experiment-screen">
      <header><span>{species.emoji}</span><div><small>{species.name}이(가) 사라진 뒤</small><h1>두 생태계는 어떻게 달라질까요?</h1></div></header>
      <div className="experiment-boards">
        <PopulationBoard result={comparison.a} tick={tick} label="A · 실제 기록만 연결" color="#ff645f" />
        <PopulationBoard result={comparison.b} tick={tick} label="B · 완성한 먹이그물" color="#4ca8ff" />
      </div>
      <div className="timeline-dots">{comparison.a.timeline.map((_, index) => <i key={index} className={index === tick ? "active" : ""} />)}</div>
    </main>
  );
}

export function FinalResultsScreen(): JSX.Element {
  const comparison = useGameStore((state) => state.snapshot.experiment);
  const removed = useGameStore((state) => state.snapshot.removedSpecies);
  const conclusion = useMemo(() => {
    if (!comparison) return "";
    const aExtinct = comparison.a.extinctSpecies.length;
    const bExtinct = comparison.b.extinctSpecies.length;
    return bExtinct < aExtinct
      ? "먹이 관계가 다양하면 한 생물이 사라져도 다른 먹이를 이용해 변화를 견딜 수 있어요."
      : "두 생태계 모두 영향을 받았어요. 어떤 관계가 부족했는지 먹이그물을 다시 살펴보세요.";
  }, [comparison]);
  if (!comparison) return <IntermissionScreen icon="📊" title="아직 실험 결과가 없어요" copy="선생님과 함께 실험을 시작해 보세요." />;
  const removedName = isSpeciesId(removed) ? SPECIES[removed].name : "한 생물";
  return (
    <main className="results-screen">
      <header><small>{removedName}이(가) 사라진 생태계</small><h1>비교 실험 결과</h1></header>
      <div className="result-columns">
        <section className="result-card result-a"><h2>A · 실제 기록만</h2><TrendChart result={comparison.a} color="#ff645f" /><p>추가로 사라진 생물 <strong>{comparison.a.extinctSpecies.length}종</strong></p></section>
        <section className="result-card result-b"><h2>B · 완성한 먹이그물</h2><TrendChart result={comparison.b} color="#4ca8ff" /><p>추가로 사라진 생물 <strong>{comparison.b.extinctSpecies.length}종</strong></p></section>
      </div>
      <div className="conclusion-bubble"><span>💡</span><strong>{conclusion}</strong></div>
    </main>
  );
}

function modeTime(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, "0")}초`;
}

function chainOrder(result: ModeResult): SpeciesId[] {
  if (!isGameModeId(result.modeId)) return [];
  const config = modeConfig(result.modeId, isSpeciesId(result.removedSpecies) ? result.removedSpecies : undefined);
  const predators = new Set(config.relations.map((edge) => edge.predator));
  const start = config.activeSpecies.find((species) => !predators.has(species));
  if (!start) return [...config.activeSpecies];
  const order: SpeciesId[] = [start];
  while (order.length < config.activeSpecies.length) {
    const next = config.relations.find((edge) => edge.prey === order[order.length - 1])?.predator;
    if (!next || order.includes(next)) break;
    order.push(next);
  }
  return order;
}

function ModePopulationChart({ result, ids }: { result: ModeResult; ids: readonly SpeciesId[] }): JSX.Element {
  const width = 760;
  const height = 220;
  const max = Math.max(1, ...result.timeline.flatMap((point) => ids.map((id) => point.populations[id] ?? 0)));
  return (
    <div className="mode-chart-wrap">
      <div className="mode-chart-legend">
        {ids.map((id) => <span key={id}><i style={{ background: SPECIES[id].cssColor }} />{SPECIES[id].emoji} {SPECIES[id].name}</span>)}
      </div>
      <svg className="mode-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="시간에 따른 개체수 변화">
        {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="32" x2={width - 14} y1={18 + line * 42} y2={18 + line * 42} stroke="#ffffff22" />)}
        {ids.map((id) => {
          const points = result.timeline.map((point, index) => `${32 + (index / Math.max(1, result.timeline.length - 1)) * (width - 48)},${height - 20 - ((point.populations[id] ?? 0) / max) * (height - 40)}`).join(" ");
          return <polyline key={id} points={points} fill="none" stroke={SPECIES[id].cssColor} strokeWidth="4" />;
        })}
      </svg>
    </div>
  );
}

export function ModeResultScreen(): JSX.Element {
  const result = useGameStore((state) => state.snapshot.modeResult);
  const [selectedSpecies, setSelectedSpecies] = useState<PlayableSpeciesId | null>(null);
  if (!result || !isGameModeId(result.modeId)) {
    return <IntermissionScreen icon="📊" title="게임 결과를 준비하고 있어요" copy="잠시만 기다려 주세요." />;
  }
  const config = modeConfig(result.modeId, isSpeciesId(result.removedSpecies) ? result.removedSpecies : undefined);
  const chain = chainOrder(result);
  const ids = config.activeSpecies.filter((id) => (result.timeline[0]?.populations[id] ?? result.finalPopulations[id] ?? 0) > 0 || id === result.removedSpecies);
  const playableIds = config.playableSpecies.filter((id) => result.players.some((player) => player.species === id));
  const rankingSpecies = selectedSpecies && playableIds.includes(selectedSpecies) ? selectedSpecies : playableIds[0];
  const ranking = rankingSpecies
    ? result.players.filter((player) => player.species === rankingSpecies).sort((a, b) => b.finalPopulation - a.finalPopulation || b.successfulEats - a.successfulEats)
    : [];

  return (
    <main className="mode-result-screen">
      <header className="mode-result-header">
        <div><small>{config.number}번 게임 · {modeTime(result.durationMs)}</small><h1>{config.title}</h1></div>
        {result.modeId === "chain_removal"
          ? <div className="removed-badge">🐸 개구리 플레이어 없음 · NPC로 관찰</div>
          : result.removedSpecies && isSpeciesId(result.removedSpecies) && <div className="removed-badge">🚫 {SPECIES[result.removedSpecies].name} 없음</div>}
      </header>
      <section className="mode-result-summary">
        <div className="mode-population-grid">
          <small className="mode-population-caption">종별 최종 개체수 합계</small>
          {ids.map((id) => <article key={id} className={(result.finalPopulations[id] ?? 0) === 0 ? "extinct" : ""}>
            <span>{SPECIES[id].emoji}</span><small>{SPECIES[id].name}</small><strong>{result.finalPopulations[id] ?? 0}</strong><em>최고 {result.peakPopulations[id] ?? 0}</em>
          </article>)}
        </div>
        <div className="mode-chain-card">
          <small>{config.kind === "chain" ? "이번 게임의 먹이사슬" : "이번 게임에서 확인한 먹이 관계"}</small>
          {config.kind === "chain" ? (
            <div className="mode-chain-flow">{chain.map((id, index) => <span key={id}><b>{SPECIES[id].emoji}</b><small>{SPECIES[id].name}</small>{index < chain.length - 1 && <i>→</i>}</span>)}</div>
          ) : (
            <div className="mode-relation-list">{(result.observedRelations.length ? result.observedRelations : config.relations).map((edge) => <span key={`${edge.prey}-${edge.predator}`}><b>{SPECIES[edge.prey].emoji} {SPECIES[edge.prey].name}</b> → {SPECIES[edge.predator].emoji} {SPECIES[edge.predator].name}</span>)}</div>
          )}
        </div>
      </section>
      <section className="mode-result-chart-card">
        <header><h2>시간에 따른 개체수 변화</h2><small>{result.timeline.length}개 시점 기록</small></header>
        <ModePopulationChart result={result} ids={ids.length ? ids : config.activeSpecies} />
      </section>
      {playableIds.length > 0 && <section className="mode-ranking-card">
        <header><h2>플레이어 개체수 순위</h2><small>생물을 눌러 순위를 바꿔 보세요.</small></header>
        <div className="ranking-species-tabs">{playableIds.map((id) => <button key={id} className={id === rankingSpecies ? "active" : ""} onClick={() => setSelectedSpecies(id)}>{SPECIES[id].emoji} {SPECIES[id].name}</button>)}</div>
        <ol>{ranking.map((player) => <li key={player.id}><span>{player.name}</span><strong>{player.finalPopulation}</strong><small>개체 · 먹기 {player.successfulEats}회</small></li>)}</ol>
      </section>}
    </main>
  );
}
