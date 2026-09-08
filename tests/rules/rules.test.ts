import { describe, expect, it } from "vitest";
import * as shared from "@feed-chain/shared";
import {
  CANONICAL_FOOD_RELATIONS,
  GAME_MODE_CONFIGS,
  MAX_STUDENT_COUNT,
  PLANT_SPAWN_POINTS,
  ROLE_DISTRIBUTION_23,
  SPAWN_POINTS,
  SPECIES,
  WORLD_HEIGHT,
  WORLD_COVER_ZONES,
  WORLD_WIDTH,
  applyMovement,
  canEat,
  canSeeThroughCover,
  coverIdAt,
  isWithinEatReach,
  isWithinEatServerReach,
  modeConfig,
  plantCountsForConsumers,
  roleQuotaForMode,
  roleSlotsForMode,
  simulateEcosystem,
} from "@feed-chain/shared";

describe("먹이 관계 규칙", () => {
  it("먹이에서 포식자 방향으로 관계를 판정한다", () => {
    expect(canEat("frog", "grasshopper")).toBe(true);
    expect(canEat("grasshopper", "frog")).toBe(false);
    expect(canEat("hawk", "snake")).toBe(true);
  });

  it("기본 역할 분포는 상위 포식자를 적게 배정한다", () => {
    expect(ROLE_DISTRIBUTION_23).toHaveLength(23);
    expect(ROLE_DISTRIBUTION_23.filter((id) => id === "hawk")).toHaveLength(1);
    expect(ROLE_DISTRIBUTION_23.filter((id) => id === "grasshopper").length).toBeGreaterThan(1);
  });

  it("21~24명 자동 배정은 포식 단계별 쿼터를 유지한다", () => {
    expect(MAX_STUDENT_COUNT).toBe(24);
    const counts = [21, 22, 23, 24] as const;
    const webExpected = [
      { apex: 3, secondary: 6, primary: 12 },
      { apex: 3, secondary: 7, primary: 12 },
      { apex: 3, secondary: 7, primary: 13 },
      { apex: 3, secondary: 7, primary: 14 },
    ] as const;
    const chainExpected = [
      { apex: 2, secondary: 6, primary: 13 },
      { apex: 2, secondary: 6, primary: 14 },
      { apex: 2, secondary: 6, primary: 15 },
      { apex: 2, secondary: 7, primary: 15 },
    ] as const;

    counts.forEach((count, index) => {
      expect(roleQuotaForMode("web_observe", count)).toEqual(webExpected[index]);
      expect(roleQuotaForMode("chain_observe", count)).toEqual(chainExpected[index]);
      expect(roleQuotaForMode("chain_removal", count)).toEqual({ apex: 3, secondary: 0, primary: count - 3 });

      const slots = roleSlotsForMode(GAME_MODE_CONFIGS.web_observe, count);
      expect(slots).toHaveLength(count);
      (Object.keys(webExpected[index]) as Array<"apex" | "secondary" | "primary">).forEach((level) => {
        expect(slots.filter((speciesId) => SPECIES[speciesId].level === level)).toHaveLength(webExpected[index][level]);
      });
    });

    expect(roleSlotsForMode(GAME_MODE_CONFIGS.chain_observe, 4)).toEqual(["hawk", "frog", "caterpillar", "caterpillar"]);
    expect(roleQuotaForMode("chain_observe", 7)).toEqual({ apex: 1, secondary: 2, primary: 4 });
    expect(roleQuotaForMode("chain_observe", 9)).toEqual({ apex: 1, secondary: 2, primary: 6 });
    expect(roleSlotsForMode(GAME_MODE_CONFIGS.chain_observe, 7).filter((id) => id === "hawk")).toHaveLength(1);
    expect(roleSlotsForMode(GAME_MODE_CONFIGS.chain_observe, 9).filter((id) => id === "frog")).toHaveLength(2);
    expect(roleSlotsForMode(GAME_MODE_CONFIGS.chain_removal, 4)).toEqual(["hawk", "caterpillar", "caterpillar", "caterpillar"]);

    const removedApexSlots = roleSlotsForMode(modeConfig("web_removal", "hawk"), 24);
    expect(removedApexSlots).toHaveLength(24);
    expect(removedApexSlots).not.toContain("hawk");
    expect(removedApexSlots.filter((speciesId) => SPECIES[speciesId].level === "apex")).toHaveLength(3);
  });

  it("점수 기능을 공개하지 않는다", () => {
    expect("SCORE_FIRST_RELATION" in shared).toBe(false);
    expect("SCORE_REPEAT_RELATION" in shared).toBe(false);
    expect("scoreForRelation" in shared).toBe(false);
    expect("roundedScore" in shared).toBe(false);
  });

  it("네 가지 수업 모드의 핵심 종과 시간을 고정한다", () => {
    expect(GAME_MODE_CONFIGS.chain_observe.durationMs).toBe(5 * 60 * 1000);
    expect(GAME_MODE_CONFIGS.chain_observe.activeSpecies).toEqual(["hawk", "frog", "caterpillar", "clover"]);
    expect(GAME_MODE_CONFIGS.chain_removal.durationMs).toBe(3 * 60 * 1000);
    expect(GAME_MODE_CONFIGS.chain_removal.playableSpecies).toEqual(["hawk", "caterpillar"]);
    expect(GAME_MODE_CONFIGS.chain_removal.npc).toEqual([{ species: "frog", count: 1, breedingEnabled: true, respawnWhenExtinct: true, eatenRespawnDelayMs: 20 * 1000 }]);
    expect(GAME_MODE_CONFIGS.chain_removal.starvationTimeoutMs).toBe(30 * 1000);
    expect(GAME_MODE_CONFIGS.chain_removal.respawnDelayMs).toBe(3000);
    expect(GAME_MODE_CONFIGS.chain_removal.starvationRespawnDelayMs).toBe(10000);
    expect(GAME_MODE_CONFIGS.chain_removal.ghostDurationMs).toBe(10000);
    expect(GAME_MODE_CONFIGS.chain_observe.plantCounts).toEqual({ clover: 38 });
    expect(GAME_MODE_CONFIGS.chain_removal.plantCounts).toEqual({ clover: 49 });
    expect(GAME_MODE_CONFIGS.web_observe.durationMs).toBe(5 * 60 * 1000);
    expect(GAME_MODE_CONFIGS.web_observe.activeSpecies).toHaveLength(14);
    expect(GAME_MODE_CONFIGS.web_observe.plantCounts).toEqual({ acorn: 5, grass: 15, berry: 12, clover: 13 });
    expect(GAME_MODE_CONFIGS.web_removal.durationMs).toBe(3 * 60 * 1000);
    expect(GAME_MODE_CONFIGS.web_removal.starvationTimeoutMs).toBe(30 * 1000);
  });

  it("생산자 슬롯을 실제로 먹을 수 있는 동물 수에 맞춰 배분한다", () => {
    expect(plantCountsForConsumers(GAME_MODE_CONFIGS.chain_removal, { hawk: 3, caterpillar: 21 }, 49)).toEqual({ clover: 49 });
    expect(plantCountsForConsumers(GAME_MODE_CONFIGS.web_observe, {
      squirrel: 4,
      grasshopper: 4,
      rabbit: 3,
      caterpillar: 3,
      bulbul: 2,
      duck: 2,
      snake: 2,
      frog: 1,
      hawk: 2,
      weasel: 1,
    }, 49)).toEqual({ acorn: 5, grass: 15, berry: 12, clover: 13 });
    expect(plantCountsForConsumers(modeConfig("web_removal", "squirrel"), { squirrel: 0, grasshopper: 4, rabbit: 3, caterpillar: 3, bulbul: 2, duck: 2 }, 49).acorn).toBe(0);
  });

  it("먹이그물 제거 모드는 선택한 종과 그 먹이·포식자 관계를 함께 뺀다", () => {
    const removed = modeConfig("web_removal", "frog");
    expect(removed.activeSpecies).not.toContain("frog");
    expect(removed.relations.some((edge) => edge.prey === "frog" || edge.predator === "frog")).toBe(false);
    const removedPlant = modeConfig("web_removal", "clover");
    expect(removedPlant.producerSpecies).not.toContain("clover");
    expect(removedPlant.plantCounts.clover).toBeUndefined();
    const removedAnimal = modeConfig("web_removal", "hawk");
    expect(removedAnimal.playableSpecies).not.toContain("hawk");
    expect(removedAnimal.relations.some((edge) => edge.predator === "hawk")).toBe(false);
  });
});

describe("21~24인 맵과 이동 밸런스", () => {
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
describe("bush cover rules", () => {
  it("shares a cover id inside one cluster and hides across clusters", () => {
    expect(WORLD_COVER_ZONES).toHaveLength(8);
    expect(coverIdAt(700, 450)).toBe("bush-northwest");
    expect(coverIdAt(2400, 1500)).toBeNull();
    expect(canSeeThroughCover(700, 450, 760, 480)).toBe(true);
    expect(canSeeThroughCover(2400, 1500, 700, 450)).toBe(false);
    expect(canSeeThroughCover(700, 450, 2400, 1500)).toBe(true);
  });
});
