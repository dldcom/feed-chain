import { describe, expect, it } from "vitest";
import {
  CANONICAL_FOOD_RELATIONS,
  PLANT_SPAWN_POINTS,
  ROLE_DISTRIBUTION_23,
  SPAWN_POINTS,
  SPECIES,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  applyMovement,
  canEat,
  isWithinEatReach,
  isWithinEatServerReach,
  scoreForRelation,
  simulateEcosystem,
} from "@feed-chain/shared";

describe("먹이 관계 규칙", () => {
  it("먹이에서 포식자 방향으로 관계를 판정한다", () => {
    expect(canEat("frog", "grasshopper")).toBe(true);
    expect(canEat("grasshopper", "frog")).toBe(false);
    expect(canEat("hawk", "snake")).toBe(true);
  });

  it("23명의 역할에 상위 포식자를 적게 배정한다", () => {
    expect(ROLE_DISTRIBUTION_23).toHaveLength(23);
    expect(ROLE_DISTRIBUTION_23.filter((id) => id === "hawk")).toHaveLength(1);
    expect(ROLE_DISTRIBUTION_23.filter((id) => id === "grasshopper").length).toBeGreaterThan(1);
  });

  it("새 관계에 반복 관계보다 큰 점수를 준다", () => {
    expect(scoreForRelation(false)).toBe(2);
    expect(scoreForRelation(true)).toBe(0.1);
  });
});

describe("23인 맵과 이동 밸런스", () => {
  it("넓은 맵에 충분한 플레이어·식물 생성 지점을 둔다", () => {
    expect(WORLD_WIDTH).toBe(4800);
    expect(WORLD_HEIGHT).toBe(3000);
    expect(SPAWN_POINTS.length).toBeGreaterThanOrEqual(30);
    expect(PLANT_SPAWN_POINTS.length).toBeGreaterThanOrEqual(45);
  });

  it("생물 간 기본속도 차이를 과도하게 벌리지 않는다", () => {
    const speeds = ROLE_DISTRIBUTION_23.map((id) => SPECIES[id].baseSpeed);
    expect(Math.max(...speeds) - Math.min(...speeds)).toBeLessThanOrEqual(14);
    expect(SPECIES.caterpillar.baseSpeed).toBeGreaterThanOrEqual(176);
  });

  it("서버와 클라이언트가 같은 고정 스텝 이동 결과를 만든다", () => {
    const server = { x: 2200, y: 1500, facingX: 0, facingY: 1, moveSpeed: 180, boundsStage: 0 };
    const client = { ...server };
    for (let tick = 0; tick < 30; tick += 1) {
      applyMovement(server, { x: 1, y: 0 }, 1 / 30);
      applyMovement(client, { x: 1, y: 0 }, 1 / 30);
    }
    expect(client).toEqual(server);
    expect(server.x).toBeCloseTo(2380, 4);
    expect(server.facingX).toBe(1);
    expect(server.facingY).toBe(0);
  });

  it("먹기는 넉넉한 전방 범위에서만 판정한다", () => {
    const attacker = { x: 100, y: 100, facingX: 1, facingY: 0 };
    expect(isWithinEatReach(attacker, { x: 165, y: 100 })).toBe(true);
    expect(isWithinEatReach(attacker, { x: 35, y: 100 })).toBe(false);
    expect(isWithinEatReach(attacker, { x: 86, y: 100 })).toBe(true);
    expect(isWithinEatReach(attacker, { x: 190, y: 100 })).toBe(false);
    expect(isWithinEatServerReach(attacker, { x: 190, y: 100 })).toBe(true);
    expect(isWithinEatServerReach({ ...attacker, facingX: -1 }, { x: 190, y: 100 }, { x: 1, y: 0 })).toBe(true);
  });
});

describe("생태계 비교 시뮬레이션", () => {
  it("제거한 종의 개체 수를 0으로 유지한다", () => {
    const result = simulateEcosystem({
      initial: { grass: 20, grasshopper: 7, frog: 4, snake: 2, hawk: 1 },
      relations: CANONICAL_FOOD_RELATIONS,
      removedSpecies: "frog",
      ticks: 8,
      seed: 7,
    });

    expect(result.timeline.every((point) => point.populations.frog === 0)).toBe(true);
    expect(result.timeline).toHaveLength(9);
  });
});
