export type FlowNode = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
  parentKey: string | null;
  showWhen: string | null;
};

/** Normalised answer string used to match branch conditions. */
/** Whether a parent's answer satisfies a child's branch condition. */
export function matchesBranch(type: string, value: unknown, showWhen: string | null): boolean {
  if (Array.isArray(value)) return showWhen != null && value.map(String).includes(showWhen);
  return answerKey(type, value) === showWhen;
}

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

/** Returns the set of visible node keys given answers keyed by node key. */
export function visibleKeys(nodes: FlowNode[], answers: Record<string, unknown>): Set<string> {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
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
  return new Set(nodes.filter((n) => visit(n)).map((n) => n.key));
}
