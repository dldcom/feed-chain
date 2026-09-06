import Phaser from "phaser";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@feed-chain/shared";

export const WORLD_TILE_KEYS = {
  meadow: "world-tile-meadow",
  dirt: "world-tile-dirt",
} as const;

const WORLD_TILE_FILES = {
  meadow: "meadow-v2.png",
  dirt: "dirt-v2.png",
} as const;

type WorldTileId = keyof typeof WORLD_TILE_KEYS;

interface TrailPoint {
  x: number;
  y: number;
}

interface DirtTrail {
  width: number;
  points: readonly TrailPoint[];
}

/**
 * The dirt paths are deliberately a little asymmetric. They guide movement around the meadow
 * without recreating the old, artificial four-way crossing.
 */
const DIRT_TRAILS: readonly DirtTrail[] = [
  {
    width: 168,
    points: [
      { x: 70, y: 650 }, { x: 380, y: 700 }, { x: 800, y: 650 }, { x: 1050, y: 620 },
      { x: 1500, y: 650 }, { x: 1750, y: 780 }, { x: 2200, y: 820 }, { x: 2550, y: 700 },
      { x: 3000, y: 720 }, { x: 3400, y: 650 }, { x: 3800, y: 780 }, { x: 4350, y: 820 }, { x: 4730, y: 650 },
    ],
  },
  {
    width: 156,
    points: [
      { x: 250, y: 610 }, { x: 380, y: 900 }, { x: 360, y: 1300 }, { x: 280, y: 1650 },
      { x: 250, y: 1900 }, { x: 300, y: 2250 }, { x: 520, y: 2450 }, { x: 300, y: 2800 },
    ],
  },
  {
    width: 156,
    points: [
      { x: 4620, y: 610 }, { x: 4500, y: 900 }, { x: 4510, y: 1280 }, { x: 4430, y: 1660 },
      { x: 4550, y: 2050 }, { x: 4520, y: 2430 }, { x: 4630, y: 2800 },
    ],
  },
  {
    width: 150,
    points: [
      { x: 560, y: 2450 }, { x: 1050, y: 2320 }, { x: 1460, y: 2450 }, { x: 1880, y: 2310 },
      { x: 2350, y: 2490 }, { x: 2850, y: 2350 }, { x: 3330, y: 2510 }, { x: 3790, y: 2360 }, { x: 4300, y: 2490 },
    ],
  },
  {
    width: 132,
    points: [{ x: 900, y: 650 }, { x: 1130, y: 900 }, { x: 1320, y: 1160 }, { x: 1600, y: 1410 }],
  },
  {
    width: 132,
    points: [{ x: 3980, y: 760 }, { x: 3700, y: 1000 }, { x: 3500, y: 1300 }, { x: 3210, y: 1510 }],
  },
  {
    width: 128,
    points: [{ x: 1200, y: 2440 }, { x: 1480, y: 2140 }, { x: 1760, y: 1850 }, { x: 2040, y: 1590 }],
  },
  {
    width: 128,
    points: [{ x: 3600, y: 2450 }, { x: 3390, y: 2140 }, { x: 3150, y: 1870 }, { x: 2880, y: 1600 }],
  },
];

function tileKey(tile: WorldTileId, prefix: string): string {
  return `${prefix}${WORLD_TILE_KEYS[tile]}`;
}

export function preloadWorldTiles(scene: Phaser.Scene, prefix = ""): void {
  (Object.keys(WORLD_TILE_KEYS) as WorldTileId[]).forEach((tile) => {
    scene.load.image(tileKey(tile, prefix), `/assets/pixel/tiles/${WORLD_TILE_FILES[tile]}`);
  });
}

function addTile(
  scene: Phaser.Scene,
  tile: WorldTileId,
  prefix: string,
  x: number,
  y: number,
  width: number,
  height: number,
  depth: number,
  alpha: number,
  name: string,
): Phaser.GameObjects.TileSprite {
  return scene.add
    .tileSprite(x, y, width, height, tileKey(tile, prefix))
    .setOrigin(0, 0)
    .setDepth(depth)
    .setAlpha(alpha)
    .setName(name);
}

function addDirtTrailSegment(
  scene: Phaser.Scene,
  prefix: string,
  first: TrailPoint,
  second: TrailPoint,
  width: number,
  index: number,
): void {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const centerX = (first.x + second.x) / 2;
  const centerY = (first.y + second.y) / 2;

  // A wider, low-contrast edge keeps the path readable without making it look like a road.
  scene.add
    .rectangle(centerX, centerY, length + 38, width + 28, 0x7a653d, 0.48)
    .setRotation(angle)
    .setDepth(2)
    .setName(`world-path-frame-${index}`);

  scene.add
    .tileSprite(centerX, centerY, length + 54, width, tileKey("dirt", prefix))
    .setOrigin(0.5, 0.5)
    .setRotation(angle)
    .setDepth(3)
    .setAlpha(0.92)
    .setName(`world-path-dirt-${index}`);
}

/**
 * Draws the reusable world surface. Gameplay geometry stays in shared/world.ts;
 * these layers are visual only and can therefore be reused by the live and test scenes.
 */
export function createWorldTileBackground(scene: Phaser.Scene, prefix = ""): void {
  // Keep a flat fallback under the texture so a partially loaded frame never flashes black.
  scene.add.graphics().setDepth(0).fillStyle(0x639f47).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  addTile(scene, "meadow", prefix, 0, 0, WORLD_WIDTH, WORLD_HEIGHT, 1, 0.82, "world-ground-meadow");

  let segmentIndex = 0;
  DIRT_TRAILS.forEach((trail) => {
    for (let index = 1; index < trail.points.length; index += 1) {
      addDirtTrailSegment(scene, prefix, trail.points[index - 1]!, trail.points[index]!, trail.width, segmentIndex);
      segmentIndex += 1;
    }
  });
}
