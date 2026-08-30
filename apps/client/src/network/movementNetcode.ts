import { Predict, type InputHandle, type Reconciler, type Room } from "@colyseus/sdk";
import { MoveInput, applyMovement, type MovableState } from "@feed-chain/shared";

interface NetcodeContext {
  room: Room;
  predict: Predict<any>;
  input?: InputHandle<MoveInput>;
  self?: Reconciler<MovableState, any>;
}

let context: NetcodeContext | null = null;

type NetcodeDebugWindow = Window & {
  __feedChainNetcode?: { position: () => { x: number; y: number } | null };
};

export function configureMovementNetcode(room: Room, controlled: boolean): void {
  context?.predict.dispose();

  const predict = Predict.get(room, { mode: "lerp", delay: 100 });
  predict.attachAll("players", {
    mode: "lerp",
    fields: ["x", "y", "facingX", "facingY"],
    delay: 100,
    smoothMs: 25,
    snap: 220,
  });

  const next: NetcodeContext = { room, predict };
  if (controlled) {
    const player = (room.state as any).players?.get(room.sessionId);
    if (!player) throw new Error("내 캐릭터 상태를 찾지 못했습니다.");
    const input = room.input<MoveInput>({ type: MoveInput, mode: "reliable" });
    if (input.tickRate === undefined) throw new Error("서버 고정 타임스텝이 설정되지 않았습니다.");
    next.input = input;
    next.self = predict.reconciler<MovableState, MoveInput>(player, {
      input,
      fields: ["x", "y", "facingX", "facingY", "moveSpeed", "boundsStage"],
      step: (stepContext, state, command) => applyMovement(state, command, stepContext.dt),
      smoothMs: 55,
      snap: 220,
    });
  }
  context = next;
  if (import.meta.env.DEV) {
    (window as NetcodeDebugWindow).__feedChainNetcode = {
      position: () => movementRenderPosition(room.sessionId),
    };
  }
}

/** Phaser의 매 렌더 프레임에서 한 번 호출한다. */
export function tickMovementNetcode(time: number, x: number, y: number): void {
  if (!context) return;
  const steps = context.predict.tick(time);
  if (!context.input) return;
  for (let index = 0; index < steps; index += 1) {
    context.input.data.x = x;
    context.input.data.y = y;
    context.input.send();
  }
}

export function movementRenderPosition(playerId: string): { x: number; y: number } | null {
  if (!context) return null;
  const player = (context.room.state as any).players?.get(playerId);
  if (!player) return null;
  return {
    x: context.predict.value(player, "x"),
    y: context.predict.value(player, "y"),
  };
}

export function movementRenderPose(playerId: string): { x: number; y: number; facingX: number; facingY: number } | null {
  if (!context) return null;
  const player = (context.room.state as any).players?.get(playerId);
  if (!player) return null;
  return {
    x: context.predict.value(player, "x"),
    y: context.predict.value(player, "y"),
    facingX: context.predict.value(player, "facingX"),
    facingY: context.predict.value(player, "facingY"),
  };
}

export function disposeMovementNetcode(): void {
  context?.predict.dispose();
  context = null;
  if (import.meta.env.DEV) delete (window as NetcodeDebugWindow).__feedChainNetcode;
}
