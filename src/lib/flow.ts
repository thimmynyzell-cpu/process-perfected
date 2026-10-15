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

/**
 * Index of the node to continue at after `idx`, given its answer. Several
 * checked options jump to the earliest of their targets; an option without a
 * jump continues with the next node.
 */
function nextIndex(
  nodes: FlowNode[],
  idx: number,
  value: unknown,
  indexOf: Map<string, number>,
): number {
  const n = nodes[idx]!;
  const values = answerValues(n.type, value);
  if (!n.jumps || !values.length) return idx + 1;
  let next = Infinity;
  for (const v of values) {
    const target = n.jumps[v] ? indexOf.get(n.jumps[v]) : undefined;
    next = Math.min(next, target !== undefined && target > idx ? target : idx + 1);
  }
  return next;
}

/** Returns the set of visible node keys given answers keyed by node key. Nodes must be in order. */
export function visibleKeys(nodes: FlowNode[], answers: Record<string, unknown>): Set<string> {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const indexOf = new Map(nodes.map((n, i) => [n.key, i]));
  const memo = new Map<string, boolean>();
  const visit = (n: FlowNode, depth = 0): boolean => {
    if (memo.has(n.key)) return memo.get(n.key)!;
    let ok = true;
    if (n.parentKey && depth < 50) {
      const p = byKey.get(n.parentKey);
      ok = !!p && visit(p, depth + 1) && matchesBranch(p.type, answers[p.key], n.showWhen);
    }
    memo.set(n.key, ok);
    return ok;
  };
  const visible = new Set<string>();
  let resumeAt = 0;
  nodes.forEach((n, idx) => {
    if (idx < resumeAt || !visit(n)) return;
    visible.add(n.key);
    resumeAt = Math.max(resumeAt, nextIndex(nodes, idx, answers[n.key], indexOf));
  });
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
