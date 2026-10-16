export type FlowNode = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
  parentKey: string | null;
  showWhen: string | null;
  /** Answer value → key of a later node to jump to. */
  jumps?: Record<string, string>;
  section?: string | null;
  /** Hidden regardless of answers, e.g. not shown at the member's level. */
  hidden?: boolean;
};

/** Whether a parent's answer satisfies a child's branch condition. */
export function matchesBranch(type: string, value: unknown, showWhen: string | null): boolean {
  if (Array.isArray(value)) return showWhen != null && value.map(String).includes(showWhen);
  return answerKey(type, value) === showWhen;
}

/** Normalised answer string used to match branch conditions. */
export function answerKey(type: string, value: unknown): string | null {
  if (type === "checkbox") return value === true ? "true" : "false";
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return String(value);
}

/** Possible branch values for an item that can act as a parent. */
export function branchValues(type: string, options: string[]): string[] {
  if (type === "checkbox") return options.length ? options : ["true", "false"];
  if (type === "dropdown") return options;
  return [];
}

/** Answer values an answer counts as, for matching jumps. */
function answerValues(type: string, value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  const k = answerKey(type, value);
  return k === null ? [] : [k];
}

export type Lane = {
  /** Answer values that lead into this lane; empty for "all other answers". */
  values: string[];
  /** First and one-past-last index of the lane's questions. */
  start: number;
  end: number;
};

/**
 * Splits the questions after a question with jumps into one lane per jump
 * target, plus a lane for answers without a jump when questions come before
 * the first target. A lane runs until the next lane starts; all lanes meet
 * again at `merge`, the end of the last target's section (or `bound`).
 * Returns null for a question without usable jumps.
 */
export function lanesOf(
  nodes: { key: string; section?: string | null; jumps?: Record<string, string> }[],
  idx: number,
  bound = nodes.length,
): { lanes: Lane[]; merge: number } | null {
  const n = nodes[idx]!;
  if (!n.jumps) return null;
  const indexOf = new Map(nodes.map((x, i) => [x.key, i]));
  const byTarget = new Map<number, string[]>();
  for (const [v, key] of Object.entries(n.jumps)) {
    const target = indexOf.get(key);
    if (target === undefined || target <= idx || target >= bound) continue;
    byTarget.set(target, [...(byTarget.get(target) ?? []), v]);
  }
  if (!byTarget.size) return null;
  const starts = [...byTarget.keys()].sort((a, b) => a - b);
  const last = starts.at(-1)!;
  const section = (i: number) => (nodes[i]?.section ?? "").trim();
  let merge = last + 1;
  while (merge < bound && section(merge) === section(last)) merge++;
  const lanes: Lane[] = [];
  if (starts[0]! > idx + 1) lanes.push({ values: [], start: idx + 1, end: starts[0]! });
  starts.forEach((start, k) =>
    lanes.push({ values: byTarget.get(start)!, start, end: starts[k + 1] ?? merge }),
  );
  return { lanes, merge };
}

/** Lanes an answer leads into: lanes for its values, or the "other answers" lane. */
export function chosenLanes(lanes: Lane[], values: string[]): Lane[] {
  if (!values.length) return lanes;
  return lanes.filter((l) =>
    values.some((v) =>
      l.values.length ? l.values.includes(v) : !lanes.some((o) => o.values.includes(v)),
    ),
  );
}

/**
 * Returns the set of visible node keys given answers keyed by node key. Nodes
 * must be in order. An answer that jumps shows only its branch and then
 * continues where the branches meet; an answer without a jump, or no answer
 * yet, carries on with the next question.
 */
export function visibleKeys(nodes: FlowNode[], answers: Record<string, unknown>): Set<string> {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const memo = new Map<string, boolean>();
  const visit = (n: FlowNode, depth = 0): boolean => {
    if (memo.has(n.key)) return memo.get(n.key)!;
    let ok = !n.hidden;
    if (ok && n.parentKey && depth < 50) {
      const p = byKey.get(n.parentKey);
      ok = !!p && visit(p, depth + 1) && matchesBranch(p.type, answers[p.key], n.showWhen);
    }
    memo.set(n.key, ok);
    return ok;
  };
  const visible = new Set<string>();
  const walk = (from: number, to: number, depth: number) => {
    let i = from;
    while (i < to) {
      const n = nodes[i]!;
      if (!visit(n)) {
        i++;
        continue;
      }
      visible.add(n.key);
      const split = depth < 20 ? lanesOf(nodes, i, to) : null;
      if (!split) {
        i++;
        continue;
      }
      const chosen = chosenLanes(split.lanes, answerValues(n.type, answers[n.key]));
      // Unanswered, or an answer without a jump: carry on with the next question.
      if (chosen.length === split.lanes.length || chosen.some((l) => !l.values.length)) {
        i++;
        continue;
      }
      // A jump leads into its branch, then past the other branches to where they meet.
      for (const lane of chosen) walk(lane.start, lane.end, depth + 1);
      i = split.merge;
    }
  };
  walk(0, nodes.length, 0);
  return visible;
}

/** Stored jumps (value → position) to node keys, via a position → key map. */
export function jumpKeys(stored: unknown, keyAt: Map<number, string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const [v, pos] of Object.entries(stored)) {
      const key = typeof pos === "number" ? keyAt.get(pos) : undefined;
      if (key) out[v] = key;
    }
  }
  return out;
}
