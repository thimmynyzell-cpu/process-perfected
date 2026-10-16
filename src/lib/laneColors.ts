/**
 * Colors that tie a branch to the answer leading into it. Class names are
 * written out in full so Tailwind picks them up.
 */
export const LANE_COLORS = [
  {
    border: "border-sky-500/60",
    bg: "bg-sky-500/5",
    text: "text-sky-700 dark:text-sky-300",
    bar: "border-l-sky-500",
    dot: "bg-sky-500",
  },
  {
    border: "border-amber-500/60",
    bg: "bg-amber-500/5",
    text: "text-amber-700 dark:text-amber-300",
    bar: "border-l-amber-500",
    dot: "bg-amber-500",
  },
  {
    border: "border-violet-500/60",
    bg: "bg-violet-500/5",
    text: "text-violet-700 dark:text-violet-300",
    bar: "border-l-violet-500",
    dot: "bg-violet-500",
  },
  {
    border: "border-emerald-500/60",
    bg: "bg-emerald-500/5",
    text: "text-emerald-700 dark:text-emerald-300",
    bar: "border-l-emerald-500",
    dot: "bg-emerald-500",
  },
  {
    border: "border-rose-500/60",
    bg: "bg-rose-500/5",
    text: "text-rose-700 dark:text-rose-300",
    bar: "border-l-rose-500",
    dot: "bg-rose-500",
  },
  {
    border: "border-orange-500/60",
    bg: "bg-orange-500/5",
    text: "text-orange-700 dark:text-orange-300",
    bar: "border-l-orange-500",
    dot: "bg-orange-500",
  },
] as const;

/** Neutral color for the lane of answers without a jump. */
export const OTHER_LANE = {
  border: "border-border",
  bg: "bg-muted/40",
  text: "text-muted-foreground",
  bar: "border-l-muted-foreground/40",
  dot: "bg-muted-foreground/50",
} as const;

export type LaneColor = (typeof LANE_COLORS)[number] | typeof OTHER_LANE;

/** Color for each lane: jump lanes cycle through the palette, the "other answers" lane is neutral. */
export function laneColors(lanes: { values: string[] }[]): LaneColor[] {
  let n = 0;
  return lanes.map((l) => (l.values.length ? LANE_COLORS[n++ % LANE_COLORS.length]! : OTHER_LANE));
}

/**
 * Colors for a whole checklist: the branch color of every question inside a
 * branch (innermost branch wins), and for each question with jumps the color
 * each of its answers leads into.
 */
export function colorTree(
  nodes: { key: string; section?: string | null; jumps?: Record<string, string> }[],
  lanesOf: (
    nodes: { key: string; section?: string | null; jumps?: Record<string, string> }[],
    idx: number,
  ) => { lanes: { values: string[]; start: number; end: number }[] } | null,
) {
  const item = new Map<string, { color: LaneColor; values: string[]; first: boolean }>();
  const answers = new Map<string, Record<string, LaneColor>>();
  nodes.forEach((n, i) => {
    const split = lanesOf(nodes, i);
    if (!split) return;
    const colors = laneColors(split.lanes);
    const byValue: Record<string, LaneColor> = {};
    split.lanes.forEach((l, k) => {
      for (const v of l.values) byValue[v] = colors[k]!;
      for (let j = l.start; j < l.end; j++)
        item.set(nodes[j]!.key, { color: colors[k]!, values: l.values, first: j === l.start });
    });
    answers.set(n.key, byValue);
  });
  return { item, answers };
}
