import Phaser from "phaser";
import {
  WORLD_COVER_ZONES,
  coverIdAt,
  type WorldCoverZone,
  type WorldRect,
} from "@feed-chain/shared";

export const WORLD_BUSH_TEXTURE_KEY = "world-bush";
export const WORLD_BUSH_FILE = "bush-tile-v1-64.png";

const BUSH_CANOPY_ALPHA = 0.46;
const BUSH_TEXTURE_SIZE = 384;

export interface WorldBushVisual {
  id: string;
  zone: WorldCoverZone;
  container: Phaser.GameObjects.Container;
}

export type WorldBushVisualMap = Map<string, WorldBushVisual>;

export function preloadWorldBush(scene: Phaser.Scene, prefix = ""): void {
  scene.load.image(`${prefix}${WORLD_BUSH_TEXTURE_KEY}`, `/assets/pixel/props/${WORLD_BUSH_FILE}`);
}

function regionsFor(zone: WorldCoverZone): readonly WorldRect[] {
  return zone.regions ?? [zone];
}

export function createWorldBushes(scene: Phaser.Scene, prefix = ""): WorldBushVisualMap {
  const bushes: WorldBushVisualMap = new Map();
  const textureKey = `${prefix}${WORLD_BUSH_TEXTURE_KEY}`;

  WORLD_COVER_ZONES.forEach((zone) => {
    const parts = regionsFor(zone).map((region, index) => {
      const sprite = scene.add
        .image(region.x + region.width / 2, region.y + region.height / 2, textureKey)
        .setOrigin(0.5, 0.5)
        .setScale(region.width / BUSH_TEXTURE_SIZE, region.height / BUSH_TEXTURE_SIZE)
        .setFlipX(index % 2 === 0)
        .setName(`${zone.id}-tile-${index}`);
      return sprite;
    });
    const container = scene.add
      .container(0, 0, parts)
      .setDepth(15)
      .setAlpha(1)
      .setData("coverId", zone.id)
      .setName(zone.id);
    bushes.set(zone.id, { id: zone.id, zone, container });
  });

  return bushes;
}

/** Updates the local canopy alpha and returns the viewer's current cover id. */
export function updateWorldBushes(bushes: WorldBushVisualMap, viewerX: number, viewerY: number): string | null {
  const viewerCoverId = coverIdAt(viewerX, viewerY);
  bushes.forEach((bush) => {
    bush.container.setAlpha(bush.id === viewerCoverId ? BUSH_CANOPY_ALPHA : 1);
  });
  return viewerCoverId;
}
