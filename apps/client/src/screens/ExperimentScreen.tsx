import { useEffect, useMemo, useRef, useState } from "react";
import { SPECIES, isGameModeId, isSpeciesId, modeConfig, type ModeResult, type PlayableSpeciesId, type SimulationResult, type SpeciesId } from "@feed-chain/shared";
import type { CSSProperties } from "react";
import { useGameStore } from "../store/gameStore";
import { PixelSpeciesIcon } from "../components/PixelSpeciesIcon";
import { IntermissionScreen } from "./IntermissionScreen";
import { downloadClassResult, leaveClass, sendTeacherCommand } from "../network/gameClient";

function PopulationBoard({ result, tick, label, color }: { result: SimulationResult; tick: number; label: string; color: string }): JSX.Element {
  const point = result.timeline[Math.min(tick, result.timeline.length - 1)] ?? result.timeline[0];
  const ids = (Object.keys(point?.populations ?? {}) as SpeciesId[]).filter((id) => (result.timeline[0]?.populations[id] ?? 0) > 0 || id === result.removedSpecies);
  return (
    <section className="population-board" style={{ borderColor: color }}>
      <header><small>{label}</small><strong>{tick === 0 ? "실험 시작" : `${tick}단계 변화`}</strong></header>
      <div className="population-grid">
        {ids.map((id) => {
          const count = point?.populations[id] ?? 0;
          return <div key={id} className={count === 0 ? "extinct" : ""}><span><PixelSpeciesIcon speciesId={id} /></span><small>{SPECIES[id].name}</small><strong>{count}</strong></div>;
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
      <div className="trend-legend">{speciesIds.map((id) => <span key={id}><i style={{ background: SPECIES[id].cssColor || color }} /><PixelSpeciesIcon speciesId={id} /> {SPECIES[id].name}</span>)}</div>
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

  if (!comparison) return <IntermissionScreen title="비교 실험을 준비하고 있어요" copy="잠시만 기다려 주세요." />;
  const removedSpeciesId = isSpeciesId(removed) ? removed : "frog";
  const species = SPECIES[removedSpeciesId];
  return (
    <main className="experiment-screen">
      <header><PixelSpeciesIcon speciesId={removedSpeciesId} /><div><small>{species.name}이(가) 사라진 뒤</small><h1>두 생태계는 어떻게 달라질까요?</h1></div></header>
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
  if (!comparison) return <IntermissionScreen title="아직 실험 결과가 없어요" copy="선생님과 함께 실험을 시작해 보세요." />;
  const removedName = isSpeciesId(removed) ? SPECIES[removed].name : "한 생물";
  return (
    <main className="results-screen">
      <header><small>{removedName}이(가) 사라진 생태계</small><h1>비교 실험 결과</h1></header>
      <div className="result-columns">
        <section className="result-card result-a"><h2>A · 실제 기록만</h2><TrendChart result={comparison.a} color="#ff645f" /><p>추가로 사라진 생물 <strong>{comparison.a.extinctSpecies.length}종</strong></p></section>
        <section className="result-card result-b"><h2>B · 완성한 먹이그물</h2><TrendChart result={comparison.b} color="#4ca8ff" /><p>추가로 사라진 생물 <strong>{comparison.b.extinctSpecies.length}종</strong></p></section>
      </div>
      <div className="conclusion-bubble"><strong>{conclusion}</strong></div>
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
  // Present a food chain from apex predator down to producer, matching the
  // classroom explanation (hawk → frog → caterpillar → clover).
  const prey = new Set(config.relations.map((edge) => edge.prey));
  const start = config.activeSpecies.find((species) => !prey.has(species));
  if (!start) return [...config.activeSpecies];
  const order: SpeciesId[] = [start];
  while (order.length < config.activeSpecies.length) {
    const next = config.relations.find((edge) => edge.predator === order[order.length - 1])?.prey;
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
        {ids.map((id) => <span key={id}><i style={{ background: SPECIES[id].cssColor }} /><PixelSpeciesIcon speciesId={id} /> {SPECIES[id].name}</span>)}
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

const CHAIN_TOPS = [80, 58, 36, 14] as const;
interface WebNodePoint {
  x: number;
  y: number;
}

interface WebTourStep {
  node: SpeciesId;
  edge?: { prey: SpeciesId; predator: SpeciesId };
  chainIndex: number;
}

// A tour is made of short, readable food-chain paths. The same predator can
// appear again later: that repetition is exactly what makes the web visible
// when the paths are overlaid one by one.
const WEB_TOUR_PATHS: readonly (readonly SpeciesId[])[] = [
  ["clover", "caterpillar", "frog", "snake", "hawk"],
  ["grass", "grasshopper", "frog", "hawk"],
  ["berry", "bulbul", "weasel"],
  ["acorn", "squirrel", "hawk"],
  ["grass", "caterpillar", "frog", "duck", "weasel"],
  ["clover", "grasshopper", "bulbul", "hawk"],
  ["grass", "grasshopper", "duck", "hawk"],
  ["grass", "rabbit", "weasel"],
  ["clover", "rabbit", "hawk"],
  ["berry", "squirrel", "weasel"],
  ["grass", "grasshopper", "frog", "weasel"],
  ["grass", "caterpillar", "bulbul", "weasel"],
  ["grass", "caterpillar", "duck", "weasel"],
];

const WEB_NODE_LAYOUT: Record<SpeciesId, WebNodePoint> = {
  grass: { x: 10, y: 79 },
  clover: { x: 31, y: 87 },
  berry: { x: 57, y: 79 },
  acorn: { x: 84, y: 87 },
  squirrel: { x: 14, y: 58 },
  grasshopper: { x: 35, y: 70 },
  caterpillar: { x: 57, y: 61 },
  rabbit: { x: 81, y: 69 },
  snake: { x: 17, y: 34 },
  frog: { x: 40, y: 46 },
  bulbul: { x: 65, y: 35 },
  duck: { x: 86, y: 47 },
  weasel: { x: 48, y: 18 },
  hawk: { x: 77, y: 25 },
};

function webTourRelationKey(prey: SpeciesId, predator: SpeciesId): string {
  return `${prey}->${predator}`;
}

function buildWebTour(config: ReturnType<typeof modeConfig>): WebTourStep[] {
  const active = new Set(config.activeSpecies);
  const validEdges = new Set(config.relations.map((edge) => webTourRelationKey(edge.prey, edge.predator)));
  const paths: SpeciesId[][] = [];
  const coveredNodes = new Set<SpeciesId>();
  const coveredEdges = new Set<string>();

  const addPath = (path: readonly SpeciesId[]) => {
    if (!path.length) return;
    const normalized = path.filter((speciesId) => active.has(speciesId));
    if (!normalized.length) return;
    paths.push([...normalized]);
    normalized.forEach((speciesId) => coveredNodes.add(speciesId));
    for (let index = 1; index < normalized.length; index += 1) {
      const prey = normalized[index - 1];
      const predator = normalized[index];
      if (prey && predator) coveredEdges.add(webTourRelationKey(prey, predator));
    }
  };

  for (const candidate of WEB_TOUR_PATHS) {
    if (!candidate.every((speciesId) => active.has(speciesId))) continue;
    let valid = true;
    for (let index = 1; index < candidate.length; index += 1) {
      const prey = candidate[index - 1];
      const predator = candidate[index];
      if (!prey || !predator || !validEdges.has(webTourRelationKey(prey, predator))) {
        valid = false;
        break;
      }
    }
    if (valid) addPath(candidate);
  }

  // If a species was removed, some of the authored routes disappear. Build
  // all producer-to-terminal paths that still exist and greedily choose the
  // ones that add the most unseen relations. Every selected route therefore
  // still starts at a plant and climbs to an apex predator.
  const outgoing = new Map<SpeciesId, SpeciesId[]>();
  config.relations.forEach((edge) => {
    if (!active.has(edge.prey) || !active.has(edge.predator)) return;
    const predators = outgoing.get(edge.prey) ?? [];
    predators.push(edge.predator);
    outgoing.set(edge.prey, predators);
  });
  const generatedPaths: SpeciesId[][] = [];
  const collectPaths = (current: SpeciesId, path: SpeciesId[]) => {
    const predators = outgoing.get(current) ?? [];
    if (!predators.length) {
      generatedPaths.push(path);
      return;
    }
    predators.forEach((predator) => {
      if (!path.includes(predator)) collectPaths(predator, [...path, predator]);
    });
  };
  config.producerSpecies.forEach((producer) => {
    if (active.has(producer)) collectPaths(producer, [producer]);
  });
  while (true) {
    let best: SpeciesId[] | undefined;
    let bestScore = 0;
    generatedPaths.forEach((candidate) => {
      let score = 0;
      for (let index = 1; index < candidate.length; index += 1) {
        const prey = candidate[index - 1];
        const predator = candidate[index];
        if (prey && predator && !coveredEdges.has(webTourRelationKey(prey, predator))) score += 1;
      }
      if (score > bestScore || (score === bestScore && score > 0 && best && candidate.length > best.length)) {
        best = candidate;
        bestScore = score;
      }
    });
    if (!best || bestScore === 0) break;
    addPath(best);
    const selectedIndex = generatedPaths.indexOf(best);
    if (selectedIndex >= 0) generatedPaths.splice(selectedIndex, 1);
  }

  // Every canonical relation gets its own short branch if it was not already
  // covered by one of the longer teaching paths. This prevents the completed
  // web from suddenly gaining edges that were never shown in the tour.
  for (const edge of config.relations) {
    const key = webTourRelationKey(edge.prey, edge.predator);
    if (!active.has(edge.prey) || !active.has(edge.predator) || coveredEdges.has(key)) continue;
    addPath([edge.prey, edge.predator]);
  }

  // A removed species can leave an otherwise isolated active node. Give it a
  // final camera stop so the end state still accounts for every visible node.
  for (const speciesId of config.activeSpecies) {
    if (!coveredNodes.has(speciesId)) {
      paths.push([speciesId]);
      coveredNodes.add(speciesId);
    }
  }

  const steps: WebTourStep[] = [];
  paths.forEach((path, chainIndex) => {
    path.forEach((node, index) => {
      const prey = path[index - 1];
      steps.push(prey ? { node, edge: { prey, predator: node }, chainIndex } : { node, chainIndex });
    });
  });
  return steps;
}

function resultCount(result: ModeResult, speciesId: SpeciesId): number {
  return result.finalPopulations[speciesId] ?? result.playerPopulations[speciesId] ?? result.npcPopulations[speciesId] ?? result.plantPopulations[speciesId] ?? 0;
}

function ChainResultScene({
  result,
  config,
  onSelect,
  showPopulationBadges,
}: {
  result: ModeResult;
  config: ReturnType<typeof modeConfig>;
  onSelect: (speciesId: PlayableSpeciesId) => void;
  showPopulationBadges: boolean;
}): JSX.Element {
  const chain = useMemo(() => chainOrder(result).reverse(), [result]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [opening, setOpening] = useState(true);
  const [zoomOut, setZoomOut] = useState(false);
  const [tourComplete, setTourComplete] = useState(false);
  const [transitioning, setTransitioning] = useState(true);
  const transitionTimer = useRef<number | null>(null);
  const chainKey = chain.join("|");

  useEffect(() => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    // The producer is the opening shot. Every following reveal is advanced
    // by the teacher so the class can pause and explain each relationship.
    setRevealedCount(chain.length ? 1 : 0);
    setOpening(true);
    setZoomOut(false);
    setTourComplete(false);
    setTransitioning(Boolean(chain.length));
    const openingTimer = window.setTimeout(() => setOpening(false), 80);
    transitionTimer.current = window.setTimeout(() => setTransitioning(false), 1150);
    return () => {
      window.clearTimeout(openingTimer);
      if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    };
  }, [chainKey]);

  const finished = chain.length > 0 && tourComplete;
  const cameraPhase = opening ? "overview" : zoomOut ? "complete" : `focus-${Math.min(3, Math.max(0, revealedCount - 1))}`;
  const playable = new Set(config.playableSpecies);
  const nextSpecies = chain[revealedCount];

  const advanceChain = () => {
    if (transitioning || finished || !chain.length) return;
    setTransitioning(true);
    if (revealedCount < chain.length) {
      setRevealedCount((current) => Math.min(chain.length, current + 1));
    } else {
      setZoomOut(true);
    }
    transitionTimer.current = window.setTimeout(() => {
      setTransitioning(false);
      if (revealedCount >= chain.length) setTourComplete(true);
    }, 1100);
  };

  return (
    <section className={`result-hero chain-result-hero ${finished ? "complete" : ""}`}>
      <div className="chain-result-stage" aria-label="생산자에서 최상위 포식자까지 이어지는 먹이사슬">
        <div className={`chain-result-camera ${cameraPhase}`}>
          <svg className="chain-result-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {chain.slice(1).map((_, index) => {
              const lowerTop = CHAIN_TOPS[index] ?? 72;
              const upperTop = CHAIN_TOPS[index + 1] ?? lowerTop - 22;
              return <line key={`${chain[index]}-${chain[index + 1]}`} className={revealedCount > index + 1 ? "revealed" : ""} x1="50" x2="50" y1={lowerTop + 8} y2={upperTop + 8} />;
            })}
          </svg>
          {chain.map((speciesId, index) => {
            const interactive = finished && playable.has(speciesId as PlayableSpeciesId);
            const nodeClass = `chain-result-node ${revealedCount > index ? "revealed" : ""} ${interactive ? "interactive" : ""} ${index === 0 ? "producer" : "animal"}`;
            const nodeStyle = { "--node-top": `${CHAIN_TOPS[index] ?? 6}%` } as CSSProperties;
            const content = (
              <>
                <span className="result-node-art"><PixelSpeciesIcon speciesId={speciesId} /></span>
                <span className="result-node-name">{SPECIES[speciesId].name}</span>
                {showPopulationBadges && <b className="result-population-badge">×{resultCount(result, speciesId)}</b>}
              </>
            );
            return interactive
              ? <button key={speciesId} type="button" className={nodeClass} style={nodeStyle} onClick={() => onSelect(speciesId as PlayableSpeciesId)} aria-label={`${SPECIES[speciesId].name} 탐험대 순위 보기`}>{content}</button>
              : <div key={speciesId} className={nodeClass} style={nodeStyle}>{content}</div>;
          })}
        </div>
      </div>
      <div className="chain-result-footnote"><span>{result.observedRelations.length}개 관계 기록</span><span>{finished ? "동물 이미지를 눌러 순위 보기" : "교사가 버튼을 눌러 다음 장면으로 이동"}</span></div>
      {!finished && <button type="button" className="result-next-step-button" disabled={transitioning} onClick={advanceChain}>{zoomOut ? "전체 사슬을 펼치는 중…" : nextSpecies ? `${SPECIES[nextSpecies].name} 보기` : "전체 먹이사슬 보기"}</button>}
    </section>
  );
}

function WebResultScene({
  result,
  config,
  onSelect,
}: {
  result: ModeResult;
  config: ReturnType<typeof modeConfig>;
  onSelect: (speciesId: PlayableSpeciesId) => void;
}): JSX.Element {
  const [revealedCount, setRevealedCount] = useState(0);
  const [opening, setOpening] = useState(true);
  const [zoomOut, setZoomOut] = useState(false);
  const [tourComplete, setTourComplete] = useState(false);
  const [transitioning, setTransitioning] = useState(true);
  const transitionTimer = useRef<number | null>(null);
  const activeKey = config.activeSpecies.join("|");
  const tourSteps = useMemo(() => buildWebTour(config), [activeKey]);
  const points = useMemo(() => {
    const map = new Map<SpeciesId, WebNodePoint>();
    config.activeSpecies.forEach((speciesId) => {
      const point = WEB_NODE_LAYOUT[speciesId];
      if (point) map.set(speciesId, point);
    });
    return map;
  }, [activeKey]);
  const observed = useMemo(() => new Set(result.observedRelations.map((edge) => `${edge.prey}->${edge.predator}`)), [result]);
  const revealedNodes = useMemo(() => new Set(tourSteps.slice(0, revealedCount).map((step) => step.node)), [tourSteps, revealedCount]);
  const revealedEdges = useMemo(() => new Set(tourSteps.slice(0, revealedCount).flatMap((step) => step.edge ? [webTourRelationKey(step.edge.prey, step.edge.predator)] : [])), [tourSteps, revealedCount]);
  const finished = tourSteps.length > 0 && tourComplete;
  const playable = new Set(config.playableSpecies);
  const currentStep = tourSteps[Math.max(0, revealedCount - 1)];
  const nextStep = tourSteps[revealedCount];
  const currentChainIndex = currentStep?.chainIndex;
  const currentChainNodes = useMemo(() => new Set(tourSteps.filter((step) => step.chainIndex === currentChainIndex).map((step) => step.node)), [tourSteps, currentChainIndex]);
  const currentChainEdges = useMemo(() => new Set(tourSteps.filter((step) => step.chainIndex === currentChainIndex && step.edge).map((step) => webTourRelationKey(step.edge!.prey, step.edge!.predator))), [tourSteps, currentChainIndex]);
  const focusPoint = currentStep ? points.get(currentStep.node) : undefined;
  const cameraStyle = useMemo(() => {
    if (!focusPoint || opening || zoomOut) return { transform: "translate3d(0, 0, 0) scale(1)" } as CSSProperties;
    const scale = 1.55;
    const x = ((50 - focusPoint.x) * (scale - 1)).toFixed(2);
    const y = ((50 - focusPoint.y) * (scale - 1)).toFixed(2);
    return { transform: `translate3d(${x}%, ${y}%, 0) scale(${scale})` } as CSSProperties;
  }, [focusPoint, opening, zoomOut]);

  useEffect(() => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    // Start on the first node. Every following node and connecting edge is
    // advanced by the teacher, just like the single food-chain result.
    setRevealedCount(tourSteps.length ? 1 : 0);
    setOpening(true);
    setZoomOut(false);
    setTourComplete(false);
    setTransitioning(Boolean(tourSteps.length));
    const openingTimer = window.setTimeout(() => setOpening(false), 80);
    transitionTimer.current = window.setTimeout(() => setTransitioning(false), 1150);
    return () => {
      window.clearTimeout(openingTimer);
      if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    };
  }, [activeKey, tourSteps.length]);

  const advanceWeb = () => {
    if (transitioning || finished || !tourSteps.length) return;
    setTransitioning(true);
    if (revealedCount < tourSteps.length) {
      setRevealedCount((current) => Math.min(tourSteps.length, current + 1));
    } else {
      setZoomOut(true);
    }
    transitionTimer.current = window.setTimeout(() => {
      setTransitioning(false);
      if (revealedCount >= tourSteps.length) setTourComplete(true);
    }, 1100);
  };

  return (
    <section className={`result-hero web-result-hero ${finished ? "complete" : ""}`}>
      <div className="web-result-stage" aria-label="여러 먹이사슬이 그물처럼 얽힌 먹이그물">
        <div className="web-result-camera" style={cameraStyle}>
          <svg className="web-result-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <marker id="web-result-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" /></marker>
            </defs>
            {config.relations.map((edge) => {
              const from = points.get(edge.prey);
              const to = points.get(edge.predator);
              if (!from || !to) return null;
              const key = `${edge.prey}->${edge.predator}`;
              const visible = revealedEdges.has(key);
              const currentPath = !zoomOut && visible && currentChainEdges.has(key);
              return <line key={key} className={`web-result-edge ${visible ? "revealed" : ""} ${observed.has(key) ? "observed" : ""} ${currentPath ? "current-path" : ""}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd="url(#web-result-arrow)" />;
            })}
          </svg>
          {[...points.entries()].map(([speciesId, point]) => {
            const visible = revealedNodes.has(speciesId);
            const interactive = finished && playable.has(speciesId as PlayableSpeciesId);
            const currentPath = !zoomOut && visible && currentChainNodes.has(speciesId);
            const nodeClass = `web-result-node ${visible ? "revealed" : ""} ${interactive ? "interactive" : ""} ${currentPath ? "current-path" : ""}`;
            const nodeStyle = { left: `${point.x}%`, top: `${point.y}%` } as CSSProperties;
            const content = <><span className="result-node-art"><PixelSpeciesIcon speciesId={speciesId} /></span><span className="result-node-name">{SPECIES[speciesId].name}</span></>;
            return interactive
              ? <button key={speciesId} type="button" className={nodeClass} style={nodeStyle} onClick={() => onSelect(speciesId as PlayableSpeciesId)} aria-label={`${SPECIES[speciesId].name} 탐험대 순위 보기`}>{content}</button>
              : <div key={speciesId} className={nodeClass} style={nodeStyle}>{content}</div>;
          })}
        </div>
      </div>
      <div className="web-result-legend"><span><i className="observed-dot" />이번 수업에서 관찰한 관계</span><span><i className="known-dot" />교과서 먹이 관계</span><span>{result.observedRelations.length}개 관계 기록</span></div>
      {!finished && <button type="button" className="result-next-step-button" disabled={transitioning} onClick={advanceWeb}>{zoomOut ? "전체 먹이그물을 펼치는 중…" : nextStep ? nextStep.edge ? `${SPECIES[nextStep.node].name}로 이동` : `${SPECIES[nextStep.node].name}에서 새 사슬 시작` : "전체 먹이그물 보기"}</button>}
    </section>
  );
}

function RankingModal({ result, speciesId, onClose }: { result: ModeResult; speciesId: PlayableSpeciesId; onClose: () => void }): JSX.Element {
  const ranking = useMemo(() => result.players
    .filter((player) => player.species === speciesId)
    .slice()
    .sort((a, b) => b.finalPopulation - a.finalPopulation || b.successfulEats - a.successfulEats || a.name.localeCompare(b.name)), [result, speciesId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="result-ranking-backdrop" role="presentation" onClick={onClose}>
      <section className="result-ranking-modal" role="dialog" aria-modal="true" aria-labelledby="result-ranking-title" onClick={(event) => event.stopPropagation()}>
        <header><div><span className="result-modal-icon"><PixelSpeciesIcon speciesId={speciesId} /></span><div><small>탐험대 기록</small><h2 id="result-ranking-title">{SPECIES[speciesId].name} 순위</h2></div></div><button type="button" className="result-modal-close" onClick={onClose} aria-label="닫기">×</button></header>
        {ranking.length ? <ol className="result-ranking-list">{ranking.map((player, index) => <li key={player.id}><span className="result-rank-number">{index + 1}</span><span className="result-rank-name">{player.name}</span><strong>×{player.finalPopulation}</strong><small>먹기 {player.successfulEats}회</small></li>)}</ol> : <p className="result-ranking-empty">이 종으로 기록된 학생이 아직 없어요.</p>}
        <button type="button" className="result-modal-done" onClick={onClose}>돌아가기</button>
      </section>
    </div>
  );
}

function ResultTeacherControls(): JSX.Element | null {
  const role = useGameStore((state) => state.role);
  if (role !== "teacher") return null;
  return (
    <aside className="result-teacher-controls">
      <div className="result-teacher-heading"><span>교사 메뉴</span><strong>다음 활동</strong></div>
      <p className="result-teacher-copy">다음 게임의 모드와 역할을 다시 준비하세요.</p>
      <button type="button" className="result-return-button" onClick={() => sendTeacherCommand({ action: "next_phase", phase: "mode_setup" })}>교사 화면으로 돌아가기</button>
      <div className="result-teacher-secondary"><button type="button" onClick={downloadClassResult}>기록 저장</button><button type="button" onClick={() => void leaveClass()}>나가기</button></div>
    </aside>
  );
}

export function ModeResultScreen(): JSX.Element {
  const result = useGameStore((state) => state.snapshot.modeResult);
  const role = useGameStore((state) => state.role);
  const [selectedSpecies, setSelectedSpecies] = useState<PlayableSpeciesId | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  if (role !== "teacher") {
    return (
      <main className="student-result-waiting">
        <span className="student-result-mark">결과</span>
        <h1>선생님의 화면을 보세요.</h1>
        <p>선생님 화면에서 생태계 결과를 확인하고 있어요.</p>
      </main>
    );
  }
  if (!result || !isGameModeId(result.modeId)) {
    return <IntermissionScreen title="게임 결과를 준비하고 있어요" copy="잠시만 기다려 주세요." />;
  }
  const config = modeConfig(result.modeId, isSpeciesId(result.removedSpecies) ? result.removedSpecies : undefined);
  const playableIds = config.playableSpecies.filter((id) => result.players.some((player) => player.species === id));
  const openRanking = (speciesId: PlayableSpeciesId) => { if (playableIds.includes(speciesId)) setSelectedSpecies(speciesId); };
  const modalSpecies = selectedSpecies && playableIds.includes(selectedSpecies) ? selectedSpecies : null;

  return (
    <main className={`mode-result-screen ${config.kind === "chain" ? "mode-result-chain" : "mode-result-web"}`}>
      <header className="result-topbar">
        <div><span className="result-topbar-mark">결과</span><div><small>{config.number}번 게임 · {modeTime(result.durationMs)}</small><h1>{config.title}</h1></div></div>
        <div className="result-topbar-meta">{result.modeId === "chain_removal" ? <span>개구리 NPC 1마리</span> : result.removedSpecies && isSpeciesId(result.removedSpecies) ? <span>{SPECIES[result.removedSpecies].name} 제외</span> : <span>{result.observedRelations.length}개 관계 기록</span>}</div>
      </header>
      {config.kind === "chain" ? <ChainResultScene key={`chain-${replayKey}`} result={result} config={config} onSelect={openRanking} showPopulationBadges={result.modeId === "chain_removal"} /> : <WebResultScene key={`web-${replayKey}`} result={result} config={config} onSelect={openRanking} />}
      <button type="button" className="result-replay-button" onClick={() => { setSelectedSpecies(null); setReplayKey((current) => current + 1); }}>결과 애니메이션 다시보기</button>
      <ResultTeacherControls />
      {modalSpecies && <RankingModal result={result} speciesId={modalSpecies} onClose={() => setSelectedSpecies(null)} />}
    </main>
  );
}
