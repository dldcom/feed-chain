import { SPECIES, isSpeciesId } from "@feed-chain/shared";
import type { CSSProperties } from "react";

const ATLAS_POSITION: Record<string, readonly [number, number]> = {
  grasshopper: [0, 0], caterpillar: [1, 0], rabbit: [2, 0], squirrel: [3, 0],
  frog: [0, 1], bulbul: [1, 1], duck: [2, 1], snake: [3, 1],
  weasel: [0, 2], hawk: [1, 2], grass: [2, 2], berry: [3, 2],
};

export function PixelSpeciesIcon({ speciesId, className = "" }: { speciesId: string; className?: string }): JSX.Element {
  const [column, row] = ATLAS_POSITION[speciesId] ?? ATLAS_POSITION.grasshopper!;
  const label = isSpeciesId(speciesId) ? SPECIES[speciesId].name : "생물";
  const style = {
    "--atlas-x": `${column * (100 / 3)}%`,
    "--atlas-y": `${row * 50}%`,
  } as CSSProperties;
  return <span className={`pixel-species-icon ${className}`.trim()} style={style} role="img" aria-label={label} />;
}
