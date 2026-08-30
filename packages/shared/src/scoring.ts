export const SCORE_FIRST_RELATION = 2;
export const SCORE_REPEAT_RELATION = 0.1;
export const WRONG_FOOD_STUN_MS = 2000;
export const GHOST_DURATION_MS = 10000;
export const EAT_COOLDOWN_MS = 800;
export const EAT_RANGE = 72;
export const EAT_CLOSE_RANGE = 26;
// 이동 예측과 서버 상태 사이의 약 100~180ms 차이를 흡수하는 권위 서버 전용 범위다.
export const EAT_SERVER_RANGE = 96;
// 140도짜리 넉넉한 전방 부채꼴. 작은 조이스틱 방향 오차를 흡수한다.
export const EAT_CONE_COS = Math.cos((70 * Math.PI) / 180);
export const EAT_SERVER_CONE_COS = Math.cos((85 * Math.PI) / 180);

export interface FacingPoint {
  x: number;
  y: number;
  facingX: number;
  facingY: number;
}

export function isWithinEatReach(
  attacker: FacingPoint,
  target: { x: number; y: number },
  range = EAT_RANGE,
  coneCos = EAT_CONE_COS,
): boolean {
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const distance = Math.hypot(dx, dy);
  if (distance > range) return false;
  if (distance <= EAT_CLOSE_RANGE) return true;
  const facingLength = Math.hypot(attacker.facingX, attacker.facingY);
  if (facingLength < 0.01 || distance < 0.01) return true;
  return (dx * attacker.facingX + dy * attacker.facingY) / (distance * facingLength) >= coneCos;
}

/** 서버의 권위 위치는 유지하면서 입력 도착 순서와 짧은 지연만 관대하게 처리한다. */
export function isWithinEatServerReach(
  attacker: FacingPoint,
  target: { x: number; y: number },
  requestedFacing?: { x: number; y: number },
): boolean {
  if (isWithinEatReach(attacker, target, EAT_SERVER_RANGE, EAT_SERVER_CONE_COS)) return true;
  if (!requestedFacing || Math.hypot(requestedFacing.x, requestedFacing.y) < 0.08) return false;
  return isWithinEatReach(
    { ...attacker, facingX: requestedFacing.x, facingY: requestedFacing.y },
    target,
    EAT_SERVER_RANGE,
    EAT_SERVER_CONE_COS,
  );
}

export function scoreForRelation(discoveredBefore: boolean): number {
  return discoveredBefore ? SCORE_REPEAT_RELATION : SCORE_FIRST_RELATION;
}

export function roundedScore(score: number): number {
  return Math.round(score * 10) / 10;
}
