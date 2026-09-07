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
const studentCount = Number.parseInt(process.env.STUDENT_COUNT ?? "24", 10);
const teacher = await client.create("ecosystem", {
  roomCode: code,
  teacherToken,
  isTeacher: true,
  nickname: "Smoke Teacher",
});
const students = [];
const roleBySession = new Map();
const teacherAssignments = new Map();
const publicSpeciesBySession = new Map();

teacher.onMessage("teacher_roles", (assignments) => {
  for (const assignment of assignments ?? []) {
    teacherAssignments.set(assignment.playerId, assignment.species);
    roleBySession.set(assignment.playerId, assignment.species);
  }
});
teacher.onMessage("public_species", (payload) => {
  for (const [sessionId, species] of Object.entries(payload?.species ?? {})) {
    publicSpeciesBySession.set(sessionId, species);
    roleBySession.set(sessionId, species);
  }
});

const waitFor = async (predicate, message, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(message);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const playerFor = (sessionId) => teacher.state.players.get(sessionId);
const speciesOf = (sessionId) => roleBySession.get(sessionId) ?? publicSpeciesBySession.get(sessionId) ?? "";

try {
  for (let index = 0; index < studentCount; index += 1) {
    const room = await client.joinById(code, { nickname: `Student ${index + 1}` });
    room.onMessage("role_briefing", (briefing) => {
      if (briefing?.species) roleBySession.set(room.sessionId, briefing.species);
    });
    room.onMessage("public_species", (payload) => {
      for (const [sessionId, species] of Object.entries(payload?.species ?? {})) {
        publicSpeciesBySession.set(sessionId, species);
        roleBySession.set(sessionId, species);
      }
    });
    students.push(room);
  }
  await waitFor(() => teacher.state.players.size === studentCount, `expected ${studentCount} students, got ${teacher.state.players.size}`);

  // Auto assignment only changes roles. The teacher explicitly reveals/starts the activity.
  teacher.send("teacher", { action: "assign_roles" });
  await waitFor(() => teacherAssignments.size === studentCount, "teacher did not receive private role assignments");
  if ([...teacher.state.players.values()].some((player) => player.species !== undefined)) {
    throw new Error("private roles leaked through the public schema");
  }
  teacher.send("teacher", { action: "reveal_roles" });
  await waitFor(() => teacher.state.phase === "role_reveal", `expected role_reveal, got ${teacher.state.phase}`);
  await waitFor(() => roleBySession.size === studentCount, "students did not receive private role briefings");
  teacher.send("teacher", { action: "next_phase", phase: "round_1" });
  await waitFor(() => teacher.state.phase === "round_1", `expected round_1, got ${teacher.state.phase}`);

  const players = [...teacher.state.players.values()];
  if (players.some((player) => !speciesOf(player.id))) throw new Error("a player is missing a species role");

  const movementInputs = new Map(students.map((room) => [room.sessionId, room.input({ type: MoveInput, mode: "reliable" })]));
  const sendMovement = (room, x, y) => {
    const input = movementInputs.get(room.sessionId);
    if (!input) throw new Error(`missing movement input for ${room.sessionId}`);
    input.data.x = x;
    input.data.y = y;
    input.send();
  };
  const moveEveryoneTo = async (target) => {
    for (let tick = 0; tick < 150; tick += 1) {
      for (const room of students) {
        const player = playerFor(room.sessionId);
        if (!player || player.status !== "active") continue;
        const dx = target.x - player.x;
        const dy = target.y - player.y;
        const distance = Math.hypot(dx, dy);
        sendMovement(room, distance > 8 ? dx / distance : 0, distance > 8 ? dy / distance : 0);
      }
      await sleep(66);
    }
    students.forEach((room) => sendMovement(room, 0, 0));
    await sleep(150);
  };

  const farAttackerRoom = students[0];
  const farAttacker = playerFor(farAttackerRoom.sessionId);
  const farTargetRoom = students
    .filter((room) => room.sessionId !== farAttackerRoom.sessionId)
    .sort((a, b) => Math.hypot(farAttacker.x - playerFor(b.sessionId).x, farAttacker.y - playerFor(b.sessionId).y) - Math.hypot(farAttacker.x - playerFor(a.sessionId).x, farAttacker.y - playerFor(a.sessionId).y))[0];
  const farTarget = playerFor(farTargetRoom.sessionId);
  if (Math.hypot(farAttacker.x - farTarget.x, farAttacker.y - farTarget.y) <= 96) throw new Error("could not find an out-of-range test target");
  const cooldownBeforeRejectedEat = farAttacker.eatReadyAt;
  farAttackerRoom.send("eat", { targetId: farTargetRoom.sessionId, facingX: 1, facingY: 0 });
  await sleep(180);
  if (farAttacker.eatReadyAt !== cooldownBeforeRejectedEat) throw new Error("out-of-range eat incorrectly consumed cooldown");

  await moveEveryoneTo({ x: 2400, y: 1500 });
  const ediblePair = students.flatMap((predatorRoom) => {
    const predator = playerFor(predatorRoom.sessionId);
    const predatorSpecies = speciesOf(predatorRoom.sessionId);
    if (!predator || !predatorSpecies) return [];
    return students.flatMap((preyRoom) => {
      const prey = playerFor(preyRoom.sessionId);
      const preySpecies = speciesOf(preyRoom.sessionId);
      if (!prey || !preySpecies || preyRoom.sessionId === predatorRoom.sessionId || !canEat(predatorSpecies, preySpecies)) return [];
      return [{ predatorRoom, preyRoom, predator, prey, predatorSpecies, preySpecies, distance: Math.hypot(predator.x - prey.x, predator.y - prey.y) }];
    });
  }).sort((a, b) => a.distance - b.distance)[0];
  if (!ediblePair || ediblePair.distance > 58) throw new Error("could not find an edible player pair in range");
  ediblePair.predatorRoom.send("eat", { targetId: ediblePair.preyRoom.sessionId, facingX: 1, facingY: 0 });
  await waitFor(() => ediblePair.prey.status === "ghost", `expected prey to become ghost, got ${ediblePair.prey.status}`);
  if (!teacher.state.observedRelations.has(relationKey(ediblePair.preySpecies, ediblePair.predatorSpecies))) throw new Error("successful relation was not recorded");

  const invalidPair = students.flatMap((attackerRoom) => {
    const attacker = playerFor(attackerRoom.sessionId);
    const attackerSpecies = speciesOf(attackerRoom.sessionId);
    if (!attacker || attacker.status !== "active" || attacker.wrongUntil > Date.now() || attacker.eatReadyAt > Date.now() || !attackerSpecies) return [];
    return students.flatMap((targetRoom) => {
      const target = playerFor(targetRoom.sessionId);
      const targetSpecies = speciesOf(targetRoom.sessionId);
      if (!target || target.status !== "active" || targetRoom.sessionId === attackerRoom.sessionId || !targetSpecies || canEat(attackerSpecies, targetSpecies)) return [];
      return [{ attackerRoom, targetRoom, attacker, distance: Math.hypot(attacker.x - target.x, attacker.y - target.y) }];
    });
  }).sort((a, b) => a.distance - b.distance)[0];
  if (!invalidPair || invalidPair.distance > 58) throw new Error("could not find an invalid food pair in range");
  invalidPair.attackerRoom.send("eat", { targetId: invalidPair.targetRoom.sessionId });
  await sleep(180);
  if (invalidPair.attacker.wrongUntil <= Date.now()) throw new Error("invalid attack did not apply stomachache stun");

  const skillRoom = students.find((room) => {
    const player = playerFor(room.sessionId);
    return player?.status === "active" && speciesOf(room.sessionId) !== "caterpillar" && player.wrongUntil <= Date.now();
  });
  if (!skillRoom) throw new Error("no active player available for skill test");
  skillRoom.send("skill");
  await sleep(180);
  if (playerFor(skillRoom.sessionId).skillReadyAt <= Date.now()) throw new Error("skill cooldown was not applied");

  const reconnectSessionId = skillRoom.sessionId;
  const reconnectSpecies = speciesOf(reconnectSessionId);
  void skillRoom.leave(false);
  await waitFor(() => playerFor(reconnectSessionId)?.connected === false, "dropped player was not marked disconnected", 1500);
  await waitFor(() => playerFor(reconnectSessionId)?.connected === true, "player did not reconnect before the mode ended", 5000);
  if (skillRoom.sessionId !== reconnectSessionId || speciesOf(reconnectSessionId) !== reconnectSpecies) throw new Error("player did not reconnect to the same role and session");

  teacher.send("teacher", { action: "adjust_time", deltaMs: -60000 });
  await sleep(180);
  if (teacher.state.timeRemainingMs > 4 * 60 * 1000) throw new Error("teacher time adjustment was not applied");

  console.log(JSON.stringify({
    ok: true,
    roomCode: code,
    students: players.length,
    phase: teacher.state.phase,
    roles: players.map((player) => speciesOf(player.id)),
    verified: ["private-role-briefing", "role-reveal", "movement", "rejected-eat-no-cooldown", "valid-eat", "ghost", "relation-record", "wrong-food-stun", "skill-cooldown", "same-session-reconnection", "teacher-time-adjustment"],
  }));
} finally {
  await Promise.all(students.map((room) => room.leave(true).catch(() => undefined)));
  await teacher.leave(true).catch(() => undefined);
}
