export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

/** Whether a question with these levels is shown to a member at `level`. Missing data shows it. */
export function shownForLevel(levels: unknown, level: unknown): boolean {
  if (!Array.isArray(levels) || typeof level !== "string") return true;
  return levels.includes(level);
}
