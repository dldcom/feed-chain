import { foodsFor, isPlayableSpeciesId, predatorsFor, SPECIES } from "@feed-chain/shared";
import { useGameStore } from "../store/gameStore";
import { PixelSpeciesIcon } from "../components/PixelSpeciesIcon";

export function RoleRevealScreen(): JSX.Element {
  const snapshot = useGameStore((state) => state.snapshot);
  const selfId = useGameStore((state) => state.selfId);
  const player = snapshot.players.find((entry) => entry.id === selfId);
  const speciesId = player && isPlayableSpeciesId(player.species) ? player.species : "grasshopper";
  const species = SPECIES[speciesId];
  const foods = foodsFor(speciesId);
  const predators = predatorsFor(speciesId);

  return (
    <main className="role-screen">
      <div className="role-rays" />
      <section className="role-card">
        <p className="eyebrow">이번 탐험에서 나는…</p>
        <div className="role-avatar" style={{ backgroundColor: species.cssColor }}><PixelSpeciesIcon speciesId={speciesId} /></div>
        <h1>{species.name}</h1>
        <p className="role-skill">⚡ {species.skill?.name ?? "생태 관찰"}</p>
        <div className="relation-panels">
          <div className="relation-panel food-panel">
            <strong>내가 먹을 수 있어요</strong>
            <div>{foods.map((id) => <span key={id}>{SPECIES[id].emoji} {SPECIES[id].name}</span>)}</div>
          </div>
          <div className="relation-panel danger-panel">
            <strong>나를 먹을 수 있어요</strong>
            <div>{predators.length ? predators.map((id) => <span key={id}>{SPECIES[id].emoji} {SPECIES[id].name}</span>) : <span>상위 포식자예요</span>}</div>
          </div>
        </div>
        <p className="waiting-copy">선생님이 탐험을 시작할 때까지 기억해 두세요!</p>
      </section>
    </main>
  );
}
