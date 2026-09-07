import { Client } from "@colyseus/sdk";
import { MoveInput } from "@feed-chain/shared";

const originalWarn = console.warn;
console.warn = (...args) => {
  if (String(args[0]).includes("onMessage() not registered")) return;
  originalWarn(...args);
};

const endpoint = process.env.FEED_CHAIN_SERVER_URL ?? "ws://127.0.0.1:2567";
const client = new Client(endpoint);
const code = `M${String(Date.now()).slice(-5)}`;
const teacher = await client.create("ecosystem", {
  roomCode: code,
  teacherToken: `mode-smoke-${Date.now()}`,
  isTeacher: true,
  nickname: "Mode Smoke Teacher",
});
const students = await Promise.all([
  client.joinById(code, { nickname: "Mode Student 1" }),
  client.joinById(code, { nickname: "Mode Student 2" }),
  client.joinById(code, { nickname: "Mode Student 3" }),
]);
const roles = new Map();
teacher.onMessage("teacher_roles", (assignments) => {
  for (const assignment of assignments ?? []) roles.set(assignment.playerId, assignment.species);
});
for (const room of students) {
  room.onMessage("role_briefing", (briefing) => {
    if (briefing?.species) roles.set(room.sessionId, briefing.species);
  });
}

const waitFor = async (predicate, message, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(message);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const playerFor = (room) => teacher.state.players.get(room.sessionId);
const sendMovement = (room, x, y) => {
  const input = movementInputs.get(room.sessionId);
  if (!input) throw new Error(`missing movement input for ${room.sessionId}`);
  input.data.x = x;
  input.data.y = y;
  input.send();
};
const movementInputs = new Map(students.map((room) => [room.sessionId, room.input({ type: MoveInput, mode: "reliable" })]));
const moveTo = async (room, target) => {
  const player = playerFor(room);
  if (!player) throw new Error("player disappeared before movement");
  const waypoints = [{ x: player.x, y: 100 }, { x: target.x, y: 100 }, { x: target.x, y: target.y }];
  for (const waypoint of waypoints) {
    // A respawn deliberately chooses a safe point away from nearby predators;
    // allow enough time to cross the full map before asserting the next eat.
    for (let index = 0; index < 520; index += 1) {
      const current = playerFor(room);
      if (!current) throw new Error("player disappeared during movement");
      const dx = waypoint.x - current.x;
      const dy = waypoint.y - current.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 45) break;
      sendMovement(room, dx / distance, dy / distance);
      await sleep(66);
    }
  }
  sendMovement(room, 0, 0);
  await sleep(120);
};
const eatAt = async (predatorRoom, targetId) => {
  const predator = playerFor(predatorRoom);
  const target = teacher.state.players.get(targetId) ?? teacher.state.plants.get(targetId);
  if (!predator || !target) throw new Error("missing eat target");
  const dx = target.x - predator.x;
  const dy = target.y - predator.y;
  const distance = Math.hypot(dx, dy) || 1;
  predatorRoom.send("eat", { targetId, facingX: dx / distance, facingY: dy / distance });
  await sleep(180);
};

const modes = [["chain_observe"], ["chain_removal"], ["web_observe"], ["web_removal", "clover"]];
const checked = [];
try {
  await waitFor(() => teacher.state.players.size === students.length, "students did not enter the room");
  for (const [modeId, removedSpecies] of modes) {
    roles.clear();
    teacher.send("teacher", { action: "start_mode", modeId, ...(removedSpecies ? { removedSpecies } : {}) });
    await waitFor(() => teacher.state.phase === "role_reveal" && teacher.state.modeId === modeId, `${modeId} did not open role reveal`);
    await waitFor(() => roles.size === students.length, `${modeId} roles were not delivered`);
    await waitFor(() => teacher.state.phase === "mode_play" && teacher.state.modeId === modeId, `${modeId} did not start`, 15000);

    const activePlayers = [...teacher.state.players.values()].filter((player) => player.status === "active");
    if (!activePlayers.length) throw new Error(`${modeId} has no active player`);
    if (modeId === "chain_removal") {
      await waitFor(() => [...teacher.state.animals.values()].some((animal) => animal.species === "frog" && animal.fixed), "chain_removal frog NPC did not arrive", 1500);
      const frogs = [...teacher.state.animals.values()].filter((animal) => animal.species === "frog" && animal.fixed);
      // The fixed frog starts at one population. It may eat a nearby plant
      // during the few ticks before this assertion, so allow that immediate
      // growth while still requiring exactly one seeded frog entity.
      if (frogs.length !== 1 || frogs[0].populationCount < 1) throw new Error("chain_removal frog NPC mismatch");
    }
    if (modeId === "web_removal" && [...teacher.state.plants.values()].some((plant) => plant.species === removedSpecies)) {
      throw new Error("removed producer still spawned");
    }

    if (modeId === "chain_observe") {
      const caterpillarRoom = students.find((room) => roles.get(room.sessionId) === "caterpillar");
      const frogRoom = students.find((room) => roles.get(room.sessionId) === "frog");
      if (!caterpillarRoom || !frogRoom) throw new Error("chain_observe roles were not assigned");
      const caterpillar = playerFor(caterpillarRoom);
      const frog = playerFor(frogRoom);
      const clover = [...teacher.state.plants.values()]
        .filter((plant) => plant.species === "clover" && plant.active)
        .sort((a, b) => Math.hypot(caterpillar.x - a.x, caterpillar.y - a.y) - Math.hypot(caterpillar.x - b.x, caterpillar.y - b.y))[0];
      if (!caterpillar || !frog || !clover) throw new Error("chain_observe food setup is incomplete");
      await moveTo(caterpillarRoom, clover);
      await eatAt(caterpillarRoom, clover.id);
      await waitFor(() => caterpillar.populationCount === 2, `population did not increase (count=${caterpillar.populationCount})`);
      await moveTo(frogRoom, caterpillar);
      await eatAt(frogRoom, caterpillar.id);
      await waitFor(() => caterpillar.status === "respawning" && caterpillar.populationCount === 1, "positive-population respawn was not scheduled");
      await waitFor(() => caterpillar.status === "active", "positive-population respawn did not complete", 5000);
      await moveTo(frogRoom, caterpillar);
      await eatAt(frogRoom, caterpillar.id);
      await waitFor(() => caterpillar.status === "ghost" && caterpillar.populationCount === 0, "zero-population eat did not enter ghost mode");
      await waitFor(() => caterpillar.status === "active" && caterpillar.populationCount === 1, "ghost respawn did not restore one population", 12000);
      checked.push({ modeId: "population_lifecycle", population: caterpillar.populationCount });
    }

    const durationMinutes = modeId === "chain_observe" || modeId === "web_observe" ? 5 : 3;
    for (let index = 0; index < durationMinutes; index += 1) {
      teacher.send("teacher", { action: "adjust_time", deltaMs: -60000 });
      await sleep(70);
    }
    await waitFor(() => teacher.state.phase === "mode_result", `${modeId} did not finish`, 2500);
    const result = JSON.parse(teacher.state.modeResultJson);
    if (result.modeId !== modeId || !Array.isArray(result.timeline)
      || !result.playerPopulations || !result.npcPopulations || !result.plantPopulations) {
      throw new Error(`${modeId} result mismatch`);
    }
    checked.push({ modeId, activePlayers: activePlayers.length, animals: teacher.state.animals.size, resultPoints: result.timeline.length });
  }
  console.log(JSON.stringify({ ok: true, checked }));
} finally {
  await Promise.all(students.map((room) => room.leave(true).catch(() => undefined)));
  await teacher.leave(true).catch(() => undefined);
}
