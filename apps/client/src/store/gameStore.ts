import type { Room } from "@colyseus/sdk";
import { create } from "zustand";
import type { ActionEffect, GameNotice, QuizAnswerSaved, QuizProgress, QuizReveal, ReflectionProgress, ReflectionSaved, RoleBriefing, TeacherRoleAssignment } from "@feed-chain/shared";
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
  roleBriefing: RoleBriefing | null;
  teacherAssignments: TeacherRoleAssignment[];
  notice: (GameNotice & { id: number }) | null;
  effect: (ActionEffect & { id: number }) | null;
  quizAnswer: QuizAnswerSaved | null;
  quizReveal: QuizReveal | null;
  quizProgress: QuizProgress | null;
  reflectionSaved: ReflectionSaved | null;
  reflectionProgress: ReflectionProgress | null;
  input: { x: number; y: number };
  setSession: (room: Room, role: Exclude<SessionRole, null>) => void;
  setSnapshot: (snapshot: GameSnapshot) => void;
  setConnecting: (connecting: boolean) => void;
  setConnection: (connected: boolean) => void;
  setError: (error: string) => void;
  setRoleBriefing: (briefing: RoleBriefing | null) => void;
  setTeacherAssignments: (assignments: TeacherRoleAssignment[]) => void;
  showNotice: (notice: GameNotice) => void;
  showEffect: (effect: ActionEffect) => void;
  setQuizAnswer: (answer: QuizAnswerSaved | null) => void;
  setQuizReveal: (reveal: QuizReveal | null) => void;
  setQuizProgress: (progress: QuizProgress | null) => void;
  setReflectionSaved: (saved: ReflectionSaved | null) => void;
  setReflectionProgress: (progress: ReflectionProgress | null) => void;
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
  roleBriefing: null,
  teacherAssignments: [],
  notice: null,
  effect: null,
  quizAnswer: null,
  quizReveal: null,
  quizProgress: null,
  reflectionSaved: null,
  reflectionProgress: null,
  input: { x: 0, y: 0 },
  setSession: (room, role) => set({ room, role, selfId: room.sessionId, connected: true, connecting: false, error: "", quizAnswer: null, quizReveal: null, quizProgress: null, reflectionSaved: null, reflectionProgress: null }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setConnecting: (connecting) => set({ connecting, error: connecting ? "" : undefined }),
  setConnection: (connected) => set({ connected }),
  setError: (error) => set({ error, connecting: false }),
  setRoleBriefing: (roleBriefing) => set({ roleBriefing }),
  setTeacherAssignments: (teacherAssignments) => set({ teacherAssignments }),
  showNotice: (notice) => set({ notice: { ...notice, id: Date.now() } }),
  showEffect: (effect) => set({ effect: { ...effect, id: Date.now() + Math.random() } }),
  setQuizAnswer: (quizAnswer) => set({ quizAnswer }),
  setQuizReveal: (quizReveal) => set({ quizReveal }),
  setQuizProgress: (quizProgress) => set({ quizProgress }),
  setReflectionSaved: (reflectionSaved) => set({ reflectionSaved }),
  setReflectionProgress: (reflectionProgress) => set({ reflectionProgress }),
  clearNotice: () => set({ notice: null }),
  setInput: (x, y) => set({ input: { x, y } }),
  reset: () => set({ room: null, role: null, snapshot: EMPTY_SNAPSHOT, selfId: "", connected: false, connecting: false, error: "", roleBriefing: null, teacherAssignments: [], notice: null, effect: null, quizAnswer: null, quizReveal: null, quizProgress: null, reflectionSaved: null, reflectionProgress: null, input: { x: 0, y: 0 } }),
}));
