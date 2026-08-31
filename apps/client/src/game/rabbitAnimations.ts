export const RABBIT_FRAME_WIDTH = 304;
export const RABBIT_FRAME_HEIGHT = 352;
export const RABBIT_EAT_ATTEMPT_EVENT = "feed-chain:rabbit-eat-attempt";

export type RabbitDirection = "down" | "left" | "right" | "up";

const DIRECTION_ROWS: Record<RabbitDirection, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

export function rabbitDirection(facingX: number, facingY: number): RabbitDirection {
  if (Math.abs(facingX) >= Math.abs(facingY)) return facingX < 0 ? "left" : "right";
  return facingY < 0 ? "up" : "down";
}

export function rabbitDirectionRow(facingX: number, facingY: number): number {
  return DIRECTION_ROWS[rabbitDirection(facingX, facingY)];
}

export function rabbitIdleFrame(facingX: number, facingY: number): number {
  return rabbitDirectionRow(facingX, facingY) * 4;
}

export function rabbitSickFrame(facingX: number, facingY: number): number {
  return rabbitDirectionRow(facingX, facingY);
}
