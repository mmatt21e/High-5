/** Stable storage keys are separate from the user-facing opponent names. */
export const RANKED_COMPUTER_LEVELS = ["easy", "medium", "hard"] as const;
export type RankedComputerLevel = (typeof RANKED_COMPUTER_LEVELS)[number];
export const COMPUTER_LEVELS = [...RANKED_COMPUTER_LEVELS, "wildcard"] as const;
export type ComputerLevel = (typeof COMPUTER_LEVELS)[number];

export const COMPUTER_OPPONENTS = {
  easy: { name: "Analyst Edge", skill: "Relaxed", description: "Unpredictable plays. A forgiving table for learning the ropes.", avatar: "avatar:frog" },
  medium: { name: "House Edge", skill: "Strategic", description: "Builds combinations and protects a decent concealed hand.", avatar: "avatar:fox" },
  hard: { name: "Counter Edge", skill: "Advanced", description: "Studies your visible rows and weighs possible outcomes before playing.", avatar: "avatar:spade" },
  wildcard: { name: "Wildcard Edge", skill: "Exhibition · untracked", description: "Cheats, bargains, and bends the rules. Challenge the tricks and use powers of your own.", avatar: "avatar:octopus" },
} as const satisfies Record<ComputerLevel, { name: string; skill: string; description: string; avatar: string }>;

export function isComputerLevel(value: unknown): value is ComputerLevel {
  return typeof value === "string" && COMPUTER_LEVELS.some((level) => level === value);
}

export function computerPlayerId(level: ComputerLevel): string {
  return `fiveo-computer-${level}`;
}

export function isComputerPlayerId(id: string): boolean {
  return COMPUTER_LEVELS.some((level) => computerPlayerId(level) === id);
}
