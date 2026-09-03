export type TrophicLevel = "producer" | "primary" | "secondary" | "apex";

export type SkillKind = "dash" | "shield" | "stealth" | "leap";

export interface SpeciesDefinition {
  id: string;
  name: string;
  emoji: string;
  color: number;
  cssColor: string;
  level: TrophicLevel;
  playable: boolean;
  baseSpeed: number;
  maxPopulation: number;
  skill?: {
    id: string;
    name: string;
    kind: SkillKind;
    durationMs: number;
    cooldownMs: number;
    speedMultiplier?: number;
    dashDistance?: number;
    invulnerable?: boolean;
    movementLocked?: boolean;
  };
}

export const SPECIES = {
  grass: {
    id: "grass",
    name: "풀",
    emoji: "🌱",
    color: 0x63c64d,
    cssColor: "#63c64d",
    level: "producer",
    playable: false,
    baseSpeed: 0,
    maxPopulation: 30,
  },
  berry: {
    id: "berry",
    name: "산수유 열매",
    emoji: "🔴",
    color: 0xe85555,
    cssColor: "#e85555",
    level: "producer",
    playable: false,
    baseSpeed: 0,
    maxPopulation: 20,
  },
  acorn: {
    id: "acorn",
    name: "도토리",
    emoji: "🌰",
    color: 0xb77942,
    cssColor: "#b77942",
    level: "producer",
    playable: false,
    baseSpeed: 0,
    maxPopulation: 28,
  },
  clover: {
    id: "clover",
    name: "토끼풀",
    emoji: "☘️",
    color: 0x74c947,
    cssColor: "#74c947",
    level: "producer",
    playable: false,
    baseSpeed: 0,
    maxPopulation: 30,
  },
  grasshopper: {
    id: "grasshopper",
    name: "메뚜기",
    emoji: "🦗",
    color: 0x91d34f,
    cssColor: "#91d34f",
    level: "primary",
    playable: true,
    baseSpeed: 188,
    maxPopulation: 9,
    skill: { id: "high_jump", name: "높이뛰기", kind: "leap", durationMs: 260, cooldownMs: 12000, dashDistance: 115 },
  },
  caterpillar: {
    id: "caterpillar",
    name: "애벌레",
    emoji: "🐛",
    color: 0x7fca62,
    cssColor: "#7fca62",
    level: "primary",
    playable: true,
    baseSpeed: 176,
    maxPopulation: 9,
    skill: { id: "curl_up", name: "몸 말기", kind: "shield", durationMs: 3000, cooldownMs: 20000, invulnerable: true, movementLocked: true },
  },
  rabbit: {
    id: "rabbit",
    name: "토끼",
    emoji: "🐇",
    color: 0xe8d8c0,
    cssColor: "#e8d8c0",
    level: "primary",
    playable: true,
    baseSpeed: 190,
    maxPopulation: 7,
    skill: { id: "sprint", name: "전력 질주", kind: "dash", durationMs: 3000, cooldownMs: 18000, speedMultiplier: 1.35 },
  },
  squirrel: {
    id: "squirrel",
    name: "다람쥐",
    emoji: "🐿️",
    color: 0xc9854f,
    cssColor: "#c9854f",
    level: "primary",
    playable: true,
    baseSpeed: 188,
    maxPopulation: 7,
    skill: { id: "quick_leap", name: "재빠른 도약", kind: "leap", durationMs: 240, cooldownMs: 14000, dashDistance: 105 },
  },
  frog: {
    id: "frog",
    name: "개구리",
    emoji: "🐸",
    color: 0x42b978,
    cssColor: "#42b978",
    level: "secondary",
    playable: true,
    baseSpeed: 184,
    maxPopulation: 6,
    skill: { id: "frog_leap", name: "폴짝 점프", kind: "leap", durationMs: 240, cooldownMs: 12000, dashDistance: 105 },
  },
  bulbul: {
    id: "bulbul",
    name: "직박구리",
    emoji: "🐦",
    color: 0x78a6d8,
    cssColor: "#78a6d8",
    level: "secondary",
    playable: true,
    baseSpeed: 186,
    maxPopulation: 6,
    skill: { id: "take_off", name: "날아오르기", kind: "leap", durationMs: 300, cooldownMs: 18000, dashDistance: 130 },
  },
  duck: {
    id: "duck",
    name: "오리",
    emoji: "🦆",
    color: 0xf0c94f,
    cssColor: "#f0c94f",
    level: "secondary",
    playable: true,
    baseSpeed: 182,
    maxPopulation: 6,
    skill: { id: "quick_steps", name: "빠른 발놀림", kind: "dash", durationMs: 4000, cooldownMs: 18000, speedMultiplier: 1.28 },
  },
  snake: {
    id: "snake",
    name: "뱀",
    emoji: "🐍",
    color: 0x6b9a58,
    cssColor: "#6b9a58",
    level: "secondary",
    playable: true,
    baseSpeed: 180,
    maxPopulation: 5,
    skill: { id: "ambush", name: "잠복", kind: "stealth", durationMs: 3000, cooldownMs: 22000 },
  },
  weasel: {
    id: "weasel",
    name: "족제비",
    emoji: "🦡",
    color: 0x9a6e45,
    cssColor: "#9a6e45",
    level: "apex",
    playable: true,
    baseSpeed: 184,
    maxPopulation: 4,
    skill: { id: "chase", name: "재빠른 추격", kind: "dash", durationMs: 2500, cooldownMs: 20000, speedMultiplier: 1.3 },
  },
  hawk: {
    id: "hawk",
    name: "매",
    emoji: "🦅",
    color: 0xc89d55,
    cssColor: "#c89d55",
    level: "apex",
    playable: true,
    baseSpeed: 182,
    maxPopulation: 3,
    skill: { id: "dive", name: "급강하", kind: "dash", durationMs: 3000, cooldownMs: 20000, speedMultiplier: 1.3 },
  },
} as const satisfies Record<string, SpeciesDefinition>;

export type SpeciesId = keyof typeof SPECIES;
type PlayableFlag<K extends SpeciesId> = (typeof SPECIES)[K]["playable"] extends true ? K : never;
export type PlayableSpeciesId = { [K in SpeciesId]: PlayableFlag<K> }[SpeciesId];
export type ProducerSpeciesId = Exclude<SpeciesId, PlayableSpeciesId>;

export const PLAYABLE_SPECIES = Object.values(SPECIES).filter(
  (species): species is (typeof SPECIES)[PlayableSpeciesId] => species.playable,
);

export const ROLE_DISTRIBUTION_23: readonly PlayableSpeciesId[] = [
  "grasshopper", "grasshopper", "grasshopper",
  "caterpillar", "caterpillar", "caterpillar",
  "rabbit", "rabbit", "rabbit",
  "squirrel", "squirrel",
  "frog", "frog", "frog",
  "bulbul", "bulbul",
  "duck", "duck",
  "snake", "snake",
  "weasel", "weasel",
  "hawk",
];

export function isSpeciesId(value: string): value is SpeciesId {
  return value in SPECIES;
}

export function isPlayableSpeciesId(value: string): value is PlayableSpeciesId {
  return isSpeciesId(value) && SPECIES[value].playable;
}

export function speciesName(id: string): string {
  return isSpeciesId(id) ? SPECIES[id].name : id;
}
