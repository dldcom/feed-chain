import type { Room } from "@colyseus/sdk";
import { create } from "zustand";
import type { ActionEffect, GameNotice } from "@feed-chain/shared";
import { EMPTY_SNAPSHOT, type GameSnapshot } from "../types";

export type SessionRole = "teacher" | "student" | null;

interface GameStore {
  room: Room | null;
  role: SessionRole;
  snapshot: GameSnapshot;
  selfId: string;
  connected: boolean;
  connecting: boolean;
  error: string;
  notice: (GameNotice & { id: number }) | null;
  effect: (ActionEffect & { id: number }) | null;
  input: { x: number; y: number };
  setSession: (room: Room, role: Exclude<SessionRole, null>) => void;
  setSnapshot: (snapshot: GameSnapshot) => void;
  setConnecting: (connecting: boolean) => void;
  setConnection: (connected: boolean) => void;
  setError: (error: string) => void;
  showNotice: (notice: GameNotice) => void;
  showEffect: (effect: ActionEffect) => void;
  clearNotice: () => void;
  setInput: (x: number, y: number) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  room: null,
  role: null,
  snapshot: EMPTY_SNAPSHOT,
  selfId: "",
  connected: false,
  connecting: false,
  error: "",
  notice: null,
  effect: null,
  input: { x: 0, y: 0 },
  setSession: (room, role) => set({ room, role, selfId: room.sessionId, connected: true, connecting: false, error: "" }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setConnecting: (connecting) => set({ connecting, error: connecting ? "" : undefined }),
  setConnection: (connected) => set({ connected }),
  setError: (error) => set({ error, connecting: false }),
  showNotice: (notice) => set({ notice: { ...notice, id: Date.now() } }),
  showEffect: (effect) => set({ effect: { ...effect, id: Date.now() + Math.random() } }),
  clearNotice: () => set({ notice: null }),
  setInput: (x, y) => set({ input: { x, y } }),
  reset: () => set({ room: null, role: null, snapshot: EMPTY_SNAPSHOT, selfId: "", connected: false, connecting: false, error: "", notice: null, effect: null, input: { x: 0, y: 0 } }),
}));
