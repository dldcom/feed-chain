export const WORLD_WIDTH = 4800;
export const WORLD_HEIGHT = 3000;
export const PLAYER_RADIUS = 22;

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const WORLD_OBSTACLES: readonly WorldRect[] = [
  { x: 420, y: 360, width: 300, height: 190 },
  { x: 1180, y: 250, width: 340, height: 220 },
  { x: 520, y: 920, width: 360, height: 230 },
  { x: 1450, y: 820, width: 290, height: 250 },
  { x: 3150, y: 310, width: 330, height: 210 },
  { x: 3980, y: 460, width: 360, height: 230 },
  { x: 3020, y: 880, width: 300, height: 230 },
  { x: 3920, y: 1010, width: 350, height: 210 },
  { x: 430, y: 1960, width: 360, height: 230 },
  { x: 1280, y: 2260, width: 330, height: 220 },
  { x: 720, y: 2520, width: 300, height: 190 },
  { x: 3030, y: 2010, width: 320, height: 230 },
  { x: 3920, y: 2180, width: 370, height: 220 },
  { x: 3480, y: 2570, width: 300, height: 180 },
  { x: 1810, y: 520, width: 260, height: 210 },
  { x: 2680, y: 2270, width: 250, height: 220 },
];

export const SPAWN_POINTS = [
  { x: 240, y: 220 }, { x: 900, y: 210 }, { x: 1700, y: 220 }, { x: 2400, y: 230 }, { x: 3100, y: 210 }, { x: 3850, y: 220 }, { x: 4560, y: 230 },
  { x: 210, y: 760 }, { x: 1040, y: 700 }, { x: 2120, y: 760 }, { x: 2670, y: 700 }, { x: 3650, y: 720 }, { x: 4580, y: 780 },
  { x: 250, y: 1470 }, { x: 980, y: 1380 }, { x: 1760, y: 1510 }, { x: 2400, y: 1500 }, { x: 3040, y: 1490 }, { x: 3820, y: 1390 }, { x: 4540, y: 1510 },
  { x: 240, y: 2260 }, { x: 1080, y: 2100 }, { x: 1980, y: 2230 }, { x: 2470, y: 2120 }, { x: 3540, y: 2070 }, { x: 4560, y: 2300 },
  { x: 230, y: 2780 }, { x: 1160, y: 2770 }, { x: 1900, y: 2760 }, { x: 2400, y: 2780 }, { x: 3030, y: 2760 }, { x: 4140, y: 2780 }, { x: 4570, y: 2760 },
] as const;

export const PLANT_SPAWN_POINTS = [
  { x: 180, y: 430 }, { x: 830, y: 420 }, { x: 1680, y: 420 }, { x: 2290, y: 410 }, { x: 2770, y: 440 }, { x: 3650, y: 420 }, { x: 4580, y: 430 },
  { x: 250, y: 820 }, { x: 970, y: 900 }, { x: 1260, y: 650 }, { x: 2170, y: 930 }, { x: 2600, y: 850 }, { x: 3480, y: 830 }, { x: 4480, y: 910 },
  { x: 350, y: 1260 }, { x: 790, y: 1320 }, { x: 1370, y: 1280 }, { x: 1900, y: 1190 }, { x: 2300, y: 1240 }, { x: 2740, y: 1240 }, { x: 3380, y: 1280 }, { x: 4070, y: 1320 }, { x: 4550, y: 1230 },
  { x: 230, y: 1700 }, { x: 720, y: 1740 }, { x: 1230, y: 1660 }, { x: 1780, y: 1810 }, { x: 2200, y: 1740 }, { x: 2660, y: 1780 }, { x: 3190, y: 1690 }, { x: 3720, y: 1770 }, { x: 4300, y: 1690 }, { x: 4600, y: 1830 },
  { x: 190, y: 2200 }, { x: 920, y: 2230 }, { x: 1710, y: 2170 }, { x: 2180, y: 2320 }, { x: 2480, y: 2050 }, { x: 3420, y: 2250 }, { x: 3790, y: 2050 }, { x: 4540, y: 2150 },
  { x: 260, y: 2650 }, { x: 1130, y: 2570 }, { x: 1690, y: 2680 }, { x: 2160, y: 2630 }, { x: 2600, y: 2700 }, { x: 3050, y: 2630 }, { x: 3890, y: 2650 }, { x: 4440, y: 2680 },
] as const;

export function shrinkBounds(stage: number): WorldRect {
  if (stage >= 2) return { x: 1200, y: 750, width: 2400, height: 1500 };
  if (stage >= 1) return { x: 600, y: 350, width: 3600, height: 2300 };
  return { x: 40, y: 40, width: WORLD_WIDTH - 80, height: WORLD_HEIGHT - 80 };
}

export function clampToBounds(x: number, y: number, stage: number): { x: number; y: number } {
  const bounds = shrinkBounds(stage);
  return {
    x: Math.max(bounds.x + PLAYER_RADIUS, Math.min(bounds.x + bounds.width - PLAYER_RADIUS, x)),
    y: Math.max(bounds.y + PLAYER_RADIUS, Math.min(bounds.y + bounds.height - PLAYER_RADIUS, y)),
  };
}

export function collidesWithObstacle(x: number, y: number): boolean {
  return WORLD_OBSTACLES.some((rect) =>
    x + PLAYER_RADIUS > rect.x && x - PLAYER_RADIUS < rect.x + rect.width &&
    y + PLAYER_RADIUS > rect.y && y - PLAYER_RADIUS < rect.y + rect.height,
  );
}
