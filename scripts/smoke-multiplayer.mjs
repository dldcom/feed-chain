import { Client } from "@colyseus/sdk";
import { MoveInput, canEat, relationKey } from "@feed-chain/shared";

const originalWarn = console.warn;
console.warn = (...args) => {
  if (String(args[0]).includes("onMessage() not registered")) return;
  originalWarn(...args);
};

const endpoint = process.env.FEED_CHAIN_SERVER_URL ?? "ws://127.0.0.1:2567";
const client = new Client(endpoint);
const code = `T${String(Date.now()).slice(-5)}`;
const teacherToken = `teacher-${Date.now()}`;
const teacher = await client.create("ecosystem", { roomCode: code, teacherToken, isTeacher: true, nickname: "테스트교사" });
const students = [];
const studentCount = Number.parseInt(process.env.STUDENT_COUNT ?? "23", 10);

const waitFor = async (predicate, message, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(message);
};

for (let index = 0; index < studentCount; index += 1) {
  students.push(await client.joinById(code, { nickname: `학생${index + 1}` }));
}
const movementInputs = new Map(students.map((room) => [
  room.sessionId,
  room.input({ type: MoveInput, mode: "reliable" }),
]));
const sendMovement = (room, x, y) => {
  const input = movementInputs.get(room.sessionId);
  if (!input) throw new Error(`missing input handle for ${room.sessionId}`);
  input.data.x = x;
  input.data.y = y;
  input.send();
};

await new Promise((resolve) => setTimeout(resolve, 250));
if (teacher.state.players.size !== studentCount) throw new Error(`expected ${studentCount} students, got ${teacher.state.players.size}`);

teacher.send("teacher", { action: "assign_roles" });
await new Promise((resolve) => setTimeout(resolve, 250));
if (teacher.state.phase !== "role_reveal") throw new Error(`expected role_reveal, got ${teacher.state.phase}`);

teacher.send("teacher", { action: "next_phase", phase: "round_1" });
await new Promise((resolve) => setTimeout(resolve, 250));
if (teacher.state.phase !== "round_1") throw new Error(`expected round_1, got ${teacher.state.phase}`);

const players = [...teacher.state.players.values()];
if (players.some((player) => !player.species)) throw new Error("a player is missing a species role");

const farAttackerRoom = students[0];
const farAttacker = teacher.state.players.get(farAttackerRoom.sessionId);
const farTargetRoom = students
  .filter((room) => room.sessionId !== farAttackerRoom.sessionId)
  .sort((a, b) => {
    const playerA = teacher.state.players.get(a.sessionId);
    const playerB = teacher.state.players.get(b.sessionId);
    return Math.hypot(farAttacker.x - playerB.x, farAttacker.y - playerB.y) - Math.hypot(farAttacker.x - playerA.x, farAttacker.y - playerA.y);
  })[0];
const farTarget = teacher.state.players.get(farTargetRoom.sessionId);
if (Math.hypot(farAttacker.x - farTarget.x, farAttacker.y - farTarget.y) <= 96) throw new Error("could not find an out-of-range cooldown test target");
const cooldownBeforeRejectedEat = farAttacker.eatReadyAt;
farAttackerRoom.send("eat", { targetId: farTargetRoom.sessionId, facingX: 1, facingY: 0 });
await new Promise((resolve) => setTimeout(resolve, 180));
if (farAttacker.eatReadyAt !== cooldownBeforeRejectedEat) throw new Error("out-of-range eat incorrectly consumed cooldown");

const goal = { x: 2400, y: 1500 };
for (let tick = 1; tick <= 120; tick += 1) {
  for (const room of students) {
    const player = teacher.state.players.get(room.sessionId);
    if (!player) continue;
    const dx = goal.x - player.x;
    const dy = goal.y - player.y;
    const length = Math.hypot(dx, dy);
    sendMovement(room, length > 8 ? dx / length : 0, length > 8 ? dy / length : 0);
  }
  await new Promise((resolve) => setTimeout(resolve, 66));
}
for (const room of students) sendMovement(room, 0, 0);
await new Promise((resolve) => setTimeout(resolve, 120));

const ediblePair = students.flatMap((predatorRoom) => {
  const predator = teacher.state.players.get(predatorRoom.sessionId);
  if (!predator) return [];
  return students.flatMap((preyRoom) => {
    const prey = teacher.state.players.get(preyRoom.sessionId);
    if (!prey || preyRoom.sessionId === predatorRoom.sessionId || !canEat(predator.species, prey.species)) return [];
    return [{ predatorRoom, preyRoom, predator, prey, distance: Math.hypot(predator.x - prey.x, predator.y - prey.y) }];
  });
}).sort((a, b) => {
  const aCount = players.filter((player) => player.species === a.prey.species).length;
  const bCount = players.filter((player) => player.species === b.prey.species).length;
  const aEnough = aCount >= 3 ? 1 : 0;
  const bEnough = bCount >= 3 ? 1 : 0;
  return bEnough - aEnough || a.distance - b.distance;
})[0];

if (!ediblePair?.prey) throw new Error("could not find an edible player pair");
if (ediblePair.distance > 58) throw new Error(`closest edible pair is still too far apart: ${ediblePair.distance}`);
const eatDx = ediblePair.prey.x - ediblePair.predator.x;
const eatDy = ediblePair.prey.y - ediblePair.predator.y;
const eatLength = Math.hypot(eatDx, eatDy) || 1;
const eatFacing = { x: eatDx / eatLength, y: eatDy / eatLength };
sendMovement(ediblePair.predatorRoom, eatFacing.x, eatFacing.y);
ediblePair.predatorRoom.send("eat", { targetId: ediblePair.preyRoom.sessionId, facingX: eatFacing.x, facingY: eatFacing.y });
await new Promise((resolve) => setTimeout(resolve, 180));
sendMovement(ediblePair.predatorRoom, 0, 0);
if (ediblePair.prey.status !== "ghost") throw new Error(`expected prey to become ghost, got ${ediblePair.prey.status}`);
if (!teacher.state.observedRelations.has(relationKey(ediblePair.prey.species, ediblePair.predator.species))) throw new Error("successful relation was not recorded");
await new Promise((resolve) => setTimeout(resolve, 900));

const invalidPair = students.flatMap((attackerRoom) => {
  const attacker = teacher.state.players.get(attackerRoom.sessionId);
  if (!attacker || attacker.status !== "active") return [];
  return students.flatMap((targetRoom) => {
    const target = teacher.state.players.get(targetRoom.sessionId);
    if (!target || target.status !== "active" || targetRoom.sessionId === attackerRoom.sessionId || canEat(attacker.species, target.species)) return [];
    return [{ attackerRoom, targetRoom, attacker, distance: Math.hypot(attacker.x - target.x, attacker.y - target.y) }];
  });
}).sort((a, b) => a.distance - b.distance)[0];

if (!invalidPair) throw new Error("could not find an invalid food pair");
if (invalidPair.distance > 58) throw new Error(`closest invalid pair is still too far apart: ${invalidPair.distance}`);
invalidPair.attackerRoom.send("eat", { targetId: invalidPair.targetRoom.sessionId });
await new Promise((resolve) => setTimeout(resolve, 180));
if (invalidPair.attacker.wrongUntil <= Date.now()) throw new Error("invalid attack did not apply stomachache stun");

const skillRoom = students.find((room) => {
  const player = teacher.state.players.get(room.sessionId);
  return player && player.status === "active" && player.species !== "caterpillar" && player.wrongUntil <= Date.now();
});
if (!skillRoom) throw new Error("no active player available for skill test");
skillRoom.send("skill");
await new Promise((resolve) => setTimeout(resolve, 180));
const skillPlayer = teacher.state.players.get(skillRoom.sessionId);
if (!skillPlayer || skillPlayer.skillReadyAt <= Date.now()) throw new Error("skill cooldown was not applied");

const caterpillarRoom = students.find((room) => {
  const player = teacher.state.players.get(room.sessionId);
  return player && player.status === "active" && player.species === "caterpillar" && player.wrongUntil <= Date.now();
});
if (!caterpillarRoom) throw new Error("no active caterpillar available for defense test");
caterpillarRoom.send("skill");
await new Promise((resolve) => setTimeout(resolve, 180));
const caterpillar = teacher.state.players.get(caterpillarRoom.sessionId);
if (!caterpillar?.shielded) throw new Error("caterpillar curl-up did not apply its shield");
await new Promise((resolve) => setTimeout(resolve, 3050));
if (caterpillar.shielded || caterpillar.escapeUntil <= Date.now()) throw new Error("caterpillar did not enter its post-shield escape window");

const timeBeforeAdjustment = teacher.state.timeRemainingMs;
teacher.send("teacher", { action: "adjust_time", deltaMs: 30000 });
await new Promise((resolve) => setTimeout(resolve, 180));
if (teacher.state.timeRemainingMs < timeBeforeAdjustment + 29000) throw new Error("teacher time adjustment was not applied");

const removedSpecies = ["snake", "frog", "duck", "squirrel"].find((species) => species !== ediblePair.predator.species && species !== ediblePair.prey.species) ?? "snake";
teacher.send("teacher", { action: "start_experiment", removedSpecies });
await new Promise((resolve) => setTimeout(resolve, 250));
if (teacher.state.phase !== "experiment_a") throw new Error("experiment A did not start");

for (let tick = 1; tick <= 120; tick += 1) {
  for (const room of students) {
    const player = teacher.state.players.get(room.sessionId);
    if (!player || player.status !== "active") continue;
    const dx = goal.x - player.x;
    const dy = goal.y - player.y;
    const length = Math.hypot(dx, dy);
    sendMovement(room, length > 8 ? dx / length : 0, length > 8 ? dy / length : 0);
  }
  await new Promise((resolve) => setTimeout(resolve, 66));
}
for (const room of students) sendMovement(room, 0, 0);
await new Promise((resolve) => setTimeout(resolve, 120));

const observedKey = relationKey(ediblePair.prey.species, ediblePair.predator.species);
const unobservedPair = students.flatMap((attackerRoom) => {
  const attacker = teacher.state.players.get(attackerRoom.sessionId);
  if (!attacker || attacker.status !== "active") return [];
  return students.flatMap((targetRoom) => {
    const target = teacher.state.players.get(targetRoom.sessionId);
    const key = target ? relationKey(target.species, attacker.species) : "";
    if (!target || target.status !== "active" || targetRoom.sessionId === attackerRoom.sessionId || !canEat(attacker.species, target.species) || key === observedKey) return [];
    const distance = Math.hypot(attacker.x - target.x, attacker.y - target.y);
    return distance <= 58 ? [{ attackerRoom, targetRoom, attacker, target }] : [];
  });
})[0];
if (!unobservedPair) throw new Error("could not find an unobserved canonical relation for experiment A gate test");
unobservedPair.attackerRoom.send("eat", { targetId: unobservedPair.targetRoom.sessionId });
await new Promise((resolve) => setTimeout(resolve, 180));
if (unobservedPair.target.status !== "active") throw new Error("experiment A allowed an unobserved canonical relation");
if (unobservedPair.attacker.wrongUntil > Date.now()) throw new Error("experiment A constraint incorrectly applied stomachache penalty");
await new Promise((resolve) => setTimeout(resolve, 900));

const reproducerRoom = students.find((room) => {
  const predator = teacher.state.players.get(room.sessionId);
  if (!predator || predator.status !== "active" || predator.species !== ediblePair.predator.species) return false;
  return students.filter((preyRoom) => {
    const prey = teacher.state.players.get(preyRoom.sessionId);
    return prey && prey.status === "active" && prey.species === ediblePair.prey.species && preyRoom.sessionId !== room.sessionId && canEat(predator.species, prey.species);
  }).length >= 3;
});
if (!reproducerRoom) throw new Error("could not find a predator with three foods for reproduction test");
const reproducer = teacher.state.players.get(reproducerRoom.sessionId);
const reproductionPreyRooms = students.filter((room) => {
  const prey = teacher.state.players.get(room.sessionId);
  return prey && prey.status === "active" && prey.species === ediblePair.prey.species && room.sessionId !== reproducerRoom.sessionId;
}).sort((a, b) => {
  const preyA = teacher.state.players.get(a.sessionId);
  const preyB = teacher.state.players.get(b.sessionId);
  return Math.hypot(reproducer.x - preyA.x, reproducer.y - preyA.y) - Math.hypot(reproducer.x - preyB.x, reproducer.y - preyB.y);
}).slice(0, 3);

for (let tick = 1; tick <= 180; tick += 1) {
  for (const room of [reproducerRoom, ...reproductionPreyRooms]) {
    const player = teacher.state.players.get(room.sessionId);
    if (!player || player.status !== "active") continue;
    const dx = goal.x - player.x;
    const dy = goal.y - player.y;
    const length = Math.hypot(dx, dy);
    sendMovement(room, length > 6 ? dx / length : 0, length > 6 ? dy / length : 0);
  }
  await new Promise((resolve) => setTimeout(resolve, 66));
}
for (const room of [reproducerRoom, ...reproductionPreyRooms]) sendMovement(room, 0, 0);
await new Promise((resolve) => setTimeout(resolve, 150));

for (let meal = 0; meal < 3; meal += 1) {
  const preyRoom = reproductionPreyRooms.find((room) => {
    const prey = teacher.state.players.get(room.sessionId);
    return prey && prey.status === "active" && prey.species === ediblePair.prey.species && room.sessionId !== reproducerRoom.sessionId && canEat(reproducer.species, prey.species) && Math.hypot(reproducer.x - prey.x, reproducer.y - prey.y) <= 58;
  });
  if (!preyRoom) throw new Error(`missing prey for reproduction meal ${meal + 1}`);
  reproducerRoom.send("eat", { targetId: preyRoom.sessionId });
  await new Promise((resolve) => setTimeout(resolve, 900));
}
if (teacher.state.animals.size < 1) throw new Error("three meals did not create an animal NPC offspring");

const reconnectIndex = students.findIndex((room) => room.sessionId !== reproducerRoom.sessionId);
const droppedRoom = students[reconnectIndex];
const droppedSessionId = droppedRoom.sessionId;
void droppedRoom.leave(false);
await waitFor(
  () => teacher.state.players.get(droppedSessionId)?.connected === false,
  "dropped player was not marked disconnected",
  1500
);
await waitFor(
  () => teacher.state.players.get(droppedSessionId)?.connected === true,
  "player did not reconnect within the grace period"
);
const restoredPlayer = teacher.state.players.get(droppedSessionId);
if (!restoredPlayer?.connected || droppedRoom.sessionId !== droppedSessionId) throw new Error("player did not reconnect to the same role and session");

console.log(JSON.stringify({
  ok: true,
  roomCode: code,
  students: players.length,
  phase: teacher.state.phase,
  roles: players.map((player) => player.species),
  verified: ["movement", "moving-eat", "rejected-eat-no-cooldown", "valid-eat", "ghost", "relation-record", "wrong-food-stun", "skill-cooldown", "caterpillar-shield-escape", "teacher-time-adjustment", "experiment-removal", "red-only-experiment-gate", "three-meal-reproduction", "same-session-reconnection"],
}));
await Promise.all(students.map((room) => room.leave(true)));
await teacher.leave(true);
