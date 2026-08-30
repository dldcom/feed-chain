import { useEffect, useMemo, useState } from "react";
import { SPECIES, isSpeciesId, type PopulationPoint, type SimulationResult, type SpeciesId } from "@feed-chain/shared";
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
