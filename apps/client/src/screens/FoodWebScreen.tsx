import { useMemo, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3";
import { SPECIES, isGameModeId, isSpeciesId, modeConfig, relationKey, type SpeciesId } from "@feed-chain/shared";
import { sendBlueEdge } from "../network/gameClient";
import { useGameStore } from "../store/gameStore";

interface GraphNode extends SimulationNodeDatum {
  id: SpeciesId;
  name: string;
  emoji: string;
  color: string;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  key: string;
  kind: "observed" | "blue";
  count: number;
}

const WIDTH = 1000;
const HEIGHT = 590;

function downloadCurrentGraph(roomCode: string): void {
  const source = document.querySelector<SVGSVGElement>(".graph-stage svg");
  if (!source) return;
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(WIDTH));
  clone.setAttribute("height", String(HEIGHT));
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    .graph-edge.observed{stroke:#ff645f}.graph-edge.blue{stroke:#4ca8ff;stroke-dasharray:10 7}
    .graph-label,.individual-label{fill:#fff;font-family:sans-serif;font-weight:900;paint-order:stroke;stroke:#102b22;stroke-width:5px}
    .individual-label{font-size:11px}.graph-label{font-size:14px}.individual-node circle,.graph-node circle{stroke:#fff;stroke-width:3px}
  `;
  clone.prepend(style);
  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 944;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#15352c";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const anchor = document.createElement("a");
    anchor.download = `먹이그물-${roomCode}.png`;
    anchor.href = canvas.toDataURL("image/png");
    anchor.click();
    URL.revokeObjectURL(url);
  };
  image.src = url;
}

function nodeId(value: string | number | GraphNode): string {
  return typeof value === "object" ? value.id : String(value);
}

function SpeciesGraph(): JSX.Element {
  const snapshot = useGameStore((state) => state.snapshot);
  const [prey, setPrey] = useState<SpeciesId | null>(null);
  const [predator, setPredator] = useState<SpeciesId | null>(null);
  const observedKeys = new Set(snapshot.observedRelations.map((edge) => relationKey(edge.prey, edge.predator)));
  const configuredMode = isGameModeId(snapshot.modeId)
    ? modeConfig(snapshot.modeId, isSpeciesId(snapshot.removedSpecies) ? snapshot.removedSpecies : undefined)
    : null;
  const visibleSpecies = configuredMode ? new Set<string>(configuredMode.activeSpecies) : new Set<string>(Object.keys(SPECIES));

  const graph = useMemo(() => {
    const nodes: GraphNode[] = (Object.keys(SPECIES) as SpeciesId[]).filter((id) => visibleSpecies.has(id)).map((id) => ({
      id,
      name: SPECIES[id].name,
      emoji: SPECIES[id].emoji,
      color: SPECIES[id].cssColor,
    }));
    const links: GraphLink[] = [
      ...snapshot.observedRelations.filter((edge) => isSpeciesId(edge.prey) && isSpeciesId(edge.predator) && visibleSpecies.has(edge.prey) && visibleSpecies.has(edge.predator)).map((edge) => ({ source: edge.prey as SpeciesId, target: edge.predator as SpeciesId, key: relationKey(edge.prey, edge.predator), kind: "observed" as const, count: edge.count })),
      ...snapshot.blueRelations.filter((edge) => isSpeciesId(edge.prey) && isSpeciesId(edge.predator) && visibleSpecies.has(edge.prey) && visibleSpecies.has(edge.predator)).map((edge) => ({ source: edge.prey as SpeciesId, target: edge.predator as SpeciesId, key: relationKey(edge.prey, edge.predator), kind: "blue" as const, count: edge.count })),
    ];
    const simulation = forceSimulation(nodes)
      .force("link", forceLink<GraphNode, GraphLink>(links).id((node) => node.id).distance(145).strength(0.7))
      .force("charge", forceManyBody().strength(-460))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collide", forceCollide<GraphNode>(66))
      .stop();
    for (let index = 0; index < 260; index += 1) simulation.tick();
    nodes.forEach((node) => {
      node.x = Math.max(70, Math.min(WIDTH - 70, node.x ?? WIDTH / 2));
      node.y = Math.max(70, Math.min(HEIGHT - 70, node.y ?? HEIGHT / 2));
    });
    return { nodes, links };
  }, [snapshot.observedRelations, snapshot.blueRelations, visibleSpecies]);

  const selectNode = (id: SpeciesId): void => {
    if (!prey || (prey && predator)) {
      setPrey(id);
      setPredator(null);
    } else if (id !== prey) {
      setPredator(id);
    }
  };

  return (
    <div className="graph-stage">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="생물 종류별 먹이그물">
        <defs>
          <marker id="arrow-red" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ff645f" /></marker>
          <marker id="arrow-blue" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#4ca8ff" /></marker>
        </defs>
        {graph.links.map((link) => {
          const source = link.source as GraphNode;
          const target = link.target as GraphNode;
          return <line key={link.key} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className={`graph-edge ${link.kind}`} strokeWidth={Math.min(8, 3 + Math.log2(link.count + 1))} markerEnd={`url(#arrow-${link.kind === "observed" ? "red" : "blue"})`} />;
        })}
        {graph.nodes.map((node) => {
          const selected = prey === node.id ? "prey-selected" : predator === node.id ? "predator-selected" : "";
          return (
            <g key={node.id} transform={`translate(${node.x} ${node.y})`} className={`graph-node ${selected}`} onClick={() => selectNode(node.id)} role="button" tabIndex={0} aria-label={`${node.name} 선택`}>
              <circle r="45" fill={node.color} />
              <text y="7" textAnchor="middle" fontSize="36">{node.emoji}</text>
              <text y="65" textAnchor="middle" className="graph-label">{node.name}</text>
            </g>
          );
        })}
      </svg>
      <div className="edge-builder">
        <div><small>① 먹이가 되는 생물</small><strong>{prey ? `${SPECIES[prey].emoji} ${SPECIES[prey].name}` : "노드를 선택하세요"}</strong></div>
        <span>→</span>
        <div><small>② 먹는 생물</small><strong>{predator ? `${SPECIES[predator].emoji} ${SPECIES[predator].name}` : "다음 노드를 선택하세요"}</strong></div>
        <button
          disabled={!prey || !predator || observedKeys.has(relationKey(prey ?? "", predator ?? ""))}
          onClick={() => {
            if (prey && predator) sendBlueEdge(prey, predator);
            setPrey(null);
            setPredator(null);
          }}
        >파란 선 추가</button>
      </div>
    </div>
  );
}

function IndividualGraph(): JSX.Element {
  const snapshot = useGameStore((state) => state.snapshot);
  const configuredMode = isGameModeId(snapshot.modeId)
    ? modeConfig(snapshot.modeId, isSpeciesId(snapshot.removedSpecies) ? snapshot.removedSpecies : undefined)
    : null;
  const visibleSpecies = configuredMode ? new Set<string>(configuredMode.activeSpecies) : null;
  const radius = 235;
  const nodes = snapshot.players.filter((player) => !visibleSpecies || visibleSpecies.has(player.species)).map((player, index) => ({
    ...player,
    x: WIDTH / 2 + Math.cos((index / Math.max(1, snapshot.players.length)) * Math.PI * 2 - Math.PI / 2) * radius,
    y: HEIGHT / 2 + Math.sin((index / Math.max(1, snapshot.players.length)) * Math.PI * 2 - Math.PI / 2) * radius,
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className="graph-stage individual-stage">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="우리 반 개체별 먹이그물">
        <defs><marker id="arrow-individual" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ff645f" /></marker></defs>
        {snapshot.individualRelations.map((edge) => {
          const source = byId.get(edge.preyPlayerId);
          const target = byId.get(edge.predatorPlayerId);
          if (!source || !target) return null;
          return <line key={`${edge.preyPlayerId}-${edge.predatorPlayerId}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className="graph-edge observed" strokeWidth={Math.min(8, 3 + Math.log2(edge.count + 1))} markerEnd="url(#arrow-individual)" />;
        })}
        {nodes.map((node) => {
          const species = isSpeciesId(node.species) ? SPECIES[node.species] : SPECIES.grasshopper;
          return (
            <g key={node.id} transform={`translate(${node.x} ${node.y})`} className="individual-node">
              <circle r="29" fill={species.cssColor} />
              <text y="7" textAnchor="middle" fontSize="25">{species.emoji}</text>
              <text y="46" textAnchor="middle" className="individual-label">{node.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function FoodWebScreen(): JSX.Element {
  const snapshot = useGameStore((state) => state.snapshot);
  const [view, setView] = useState<"individual" | "species">("individual");
  const progress = snapshot.expectedRelations ? Math.round(((snapshot.observedRelations.length + snapshot.blueRelations.length) / snapshot.expectedRelations) * 100) : 0;

  return (
    <main className="food-web-screen">
      <header className="web-header">
        <div><small>우리 반이 직접 만든</small><h1>먹이그물</h1></div>
        <div className="legend"><span><i className="red-line" /> 실제 플레이 기록</span><span><i className="blue-line" /> 우리가 추가한 관계</span></div>
        <div className="web-header-actions">
          <div className="web-progress"><small>먹이그물 완성도</small><strong>{progress}%</strong></div>
          <button onClick={() => downloadCurrentGraph(snapshot.roomCode)}>📷 이미지 저장</button>
        </div>
      </header>
      <div className="view-switch">
        <button className={view === "individual" ? "active" : ""} onClick={() => setView("individual")}>👥 우리 반 23개체</button>
        <button className={view === "species" ? "active" : ""} onClick={() => setView("species")}>🌿 생물 종류별 보기</button>
      </div>
      {view === "individual" ? <IndividualGraph /> : <SpeciesGraph />}
      {view === "individual" && <p className="web-tip">빨간 화살표는 <strong>먹이가 된 생물 → 먹은 생물</strong> 방향이에요.</p>}
    </main>
  );
}
