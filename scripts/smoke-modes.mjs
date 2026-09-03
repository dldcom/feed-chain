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
  nickname: "검증교사",
});
const students = await Promise.all([
  client.joinById(code, { nickname: "검증학생1" }),
  client.joinById(code, { nickname: "검증학생2" }),
  client.joinById(code, { nickname: "검증학생3" }),
]);

const waitFor = async (predicate, message, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(message);
};

const modes = [
  ["chain_observe"],
  ["chain_removal"],
  ["web_observe"],
  ["web_removal", "clover"],
];
const checked = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const movementInputs = new Map(students.map((room) => [room.sessionId, room.input({ type: MoveInput, mode: "reliable" })]));
const sendMovement = (room, x, y) => {
  const input = movementInputs.get(room.sessionId);
  if (!input) throw new Error(`missing movement input for ${room.sessionId}`);
  input.data.x = x;
  input.data.y = y;
  input.send();
};
const moveTo = async (room, target) => {
  const player = teacher.state.players.get(room.sessionId);
  if (!player) throw new Error("player disappeared before movement");
  const waypoints = [
    { x: player.x, y: 100 },
    { x: target.x, y: 100 },
    { x: target.x, y: target.y },
  ];
  for (const waypoint of waypoints) {
    for (let index = 0; index < 220; index += 1) {
      const current = teacher.state.players.get(room.sessionId);
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
  const predator = teacher.state.players.get(predatorRoom.sessionId);
  const target = teacher.state.players.get(targetId) ?? teacher.state.plants.get(targetId);
  if (!predator || !target) throw new Error("missing eat target");
  const dx = target.x - predator.x;
  const dy = target.y - predator.y;
  const distance = Math.hypot(dx, dy) || 1;
  predatorRoom.send("eat", { targetId, facingX: dx / distance, facingY: dy / distance });
  await sleep(180);
};

for (const [modeId, removedSpecies] of modes) {
  teacher.send("teacher", {
    action: "start_mode",
    modeId,
    ...(removedSpecies ? { removedSpecies } : {}),
  });
  await waitFor(
    () => teacher.state.phase === "mode_play" && teacher.state.modeId === modeId,
    `${modeId} did not start`,
  );

  const activePlayers = [...teacher.state.players.values()].filter((player) => player.status === "active");
  if (!activePlayers.length) throw new Error(`${modeId} has no active player`);
  if (modeId === "chain_removal") {
    const frogs = [...teacher.state.animals.values()].filter((animal) => animal.species === "frog" && animal.fixed);
    if (frogs.length !== 1 || frogs[0].populationCount !== 1) throw new Error("chain_removal frog NPC mismatch");
  }
  if (modeId === "web_removal" && [...teacher.state.plants.values()].some((plant) => plant.species === removedSpecies)) {
    throw new Error("removed producer still spawned");
  }

  if (modeId === "chain_observe") {
    const caterpillarRoom = students.find((room) => teacher.state.players.get(room.sessionId)?.species === "caterpillar");
    const frogRoom = students.find((room) => teacher.state.players.get(room.sessionId)?.species === "frog");
    if (!caterpillarRoom || !frogRoom) throw new Error("chain_observe roles were not assigned");
    const caterpillar = teacher.state.players.get(caterpillarRoom.sessionId);
    const frog = teacher.state.players.get(frogRoom.sessionId);
    if (!caterpillar || !frog) throw new Error("chain_observe players missing");
    const clover = [...teacher.state.plants.values()]
      .filter((plant) => plant.species === "clover" && plant.active)
      .sort((a, b) => Math.hypot(caterpillar.x - a.x, caterpillar.y - a.y) - Math.hypot(caterpillar.x - b.x, caterpillar.y - b.y))[0];
    if (!clover) throw new Error("chain_observe clover was not spawned");
    await moveTo(caterpillarRoom, clover);
    await eatAt(caterpillarRoom, clover.id);
    await waitFor(() => caterpillar.populationCount === 2, `eating did not increase population (count=${caterpillar.populationCount}, cloverActive=${clover.active})`);

    await moveTo(frogRoom, caterpillar);
    const beforeRespawn = { x: caterpillar.x, y: caterpillar.y };
    await eatAt(frogRoom, caterpillar.id);
    await waitFor(() => caterpillar.status === "respawning" && caterpillar.populationCount === 1, "positive-population eat did not schedule respawn");
    await waitFor(() => caterpillar.status === "active", "positive-population respawn did not complete", 5000);
    if (caterpillar.x === beforeRespawn.x && caterpillar.y === beforeRespawn.y) throw new Error("respawn did not choose another location");

    await moveTo(frogRoom, caterpillar);
    await eatAt(frogRoom, caterpillar.id);
    await waitFor(() => caterpillar.status === "ghost" && caterpillar.populationCount === 0, "zero-population eat did not enter ghost mode");
    await waitFor(() => caterpillar.status === "active" && caterpillar.populationCount === 1, "ghost respawn did not restore one population", 12000);
    checked.push({ modeId: "population_lifecycle", positiveRespawnMs: 3000, ghostMs: 10000, population: caterpillar.populationCount });
  }

  const durationMinutes = modeId === "chain_observe" || modeId === "web_observe" ? 5 : 3;
  for (let index = 0; index < durationMinutes; index += 1) {
    teacher.send("teacher", { action: "adjust_time", deltaMs: -60000 });
    await new Promise((resolve) => setTimeout(resolve, 70));
  }
  await waitFor(() => teacher.state.phase === "mode_result", `${modeId} did not finish`, 2500);
  const result = JSON.parse(teacher.state.modeResultJson);
  if (result.modeId !== modeId || !Array.isArray(result.timeline)) throw new Error(`${modeId} result mismatch`);
  checked.push({ modeId, activePlayers: activePlayers.length, animals: teacher.state.animals.size, resultPoints: result.timeline.length });
}

console.log(JSON.stringify({ ok: true, checked }));
await Promise.all(students.map((room) => room.leave(true)));
await teacher.leave(true);
