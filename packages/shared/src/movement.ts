import { schema, t, type SchemaType } from "@colyseus/schema";
import { clampToBounds, collidesWithObstacle } from "./world.js";

export const MoveInput = schema({
  x: t.float32(),
  y: t.float32(),
});

export type MoveInput = SchemaType<typeof MoveInput>;

export interface MovementCommand {
  x: number;
  y: number;
}

export interface MovableState {
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  moveSpeed: number;
  boundsStage: number;
}

/** 서버와 예측 클라이언트가 함께 실행하는 결정론적 이동 한 스텝. */
export function applyMovement(state: MovableState, input: MovementCommand, deltaSeconds: number): void {
  const rawLength = Math.hypot(input.x, input.y);
  const x = rawLength > 1 ? input.x / rawLength : input.x;
  const y = rawLength > 1 ? input.y / rawLength : input.y;
  if (rawLength > 0.08) {
    state.facingX = x;
    state.facingY = y;
  }
  const next = clampToBounds(
    state.x + x * state.moveSpeed * deltaSeconds,
    state.y + y * state.moveSpeed * deltaSeconds,
    state.boundsStage,
  );

  if (!collidesWithObstacle(next.x, state.y)) state.x = next.x;
  if (!collidesWithObstacle(state.x, next.y)) state.y = next.y;
}
