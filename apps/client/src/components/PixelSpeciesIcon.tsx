import { SPECIES, isSpeciesId } from "@feed-chain/shared";
import type { CSSProperties } from "react";
import { isSpriteSpecies, speciesSpriteConfig } from "../game/speciesAnimations";

const ATLAS_POSITION: Record<string, readonly [number, number]> = {
  grasshopper: [0, 0], caterpillar: [1, 0], rabbit: [2, 0], squirrel: [3, 0],
  frog: [0, 1], bulbul: [1, 1], duck: [2, 1], snake: [3, 1],
  weasel: [0, 2], hawk: [1, 2], grass: [2, 2], berry: [3, 2],
};

const PLANT_ICON_SPECIES = new Set(["grass", "berry", "acorn", "clover"]);

export function PixelSpeciesIcon({ speciesId, className = "" }: { speciesId: string; className?: string }): JSX.Element {
  const atlasPosition = ATLAS_POSITION[speciesId];
  const [column, row] = atlasPosition ?? ATLAS_POSITION.grasshopper!;
  const label = isSpeciesId(speciesId) ? SPECIES[speciesId].name : "생물";
  const spriteSpecies = isSpriteSpecies(speciesId) ? speciesId : null;
  const style = {
    "--atlas-x": `${column * (100 / 3)}%`,
    "--atlas-y": `${row * 50}%`,
  } as CSSProperties;
  if (spriteSpecies) {
    // Use the first (down/idle) frame as the canonical portrait so menus,
    // role cards, HUDs, and the Phaser world all show the same artwork.
    style.backgroundImage = `url("/assets/pixel/animals/${speciesSpriteConfig(spriteSpecies).movementFile}")`;
    style.backgroundSize = "400% 400%";
    style.backgroundPosition = "0% 0%";
    style.backgroundColor = "transparent";
  } else if (!atlasPosition && PLANT_ICON_SPECIES.has(speciesId)) {
    style.backgroundImage = `url("/assets/pixel/plants/${speciesId}.png")`;
    style.backgroundSize = "contain";
    style.backgroundPosition = "center";
    style.backgroundColor = "transparent";
  }
  const plantClass = !atlasPosition && PLANT_ICON_SPECIES.has(speciesId) ? " plant-icon" : "";
  return <span className={`pixel-species-icon${plantClass} ${className}`.trim()} style={style} role="img" aria-label={label} />;
}
