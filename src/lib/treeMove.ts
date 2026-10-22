import { MERGE, lanesOf, type Lane } from "./flow";

export type TreeItem = { key: string; section: string; jumps: Record<string, string> };

export type TreeLane = Lane & { id: string; owner: string; rows: TreeRow[] };
export type TreeRow = { key: string; idx: number; lanes: TreeLane[] };
/** A list of sibling rows: the main flow, or one branch. */
export type Container = {
  id: string;
  owner: string | null;
  values: string[];
  start: number;
  end: number;
  rows: TreeRow[];
};

export const MAIN = "main";
export const laneId = (owner: string, startKey: string) => `${owner}:${startKey}`;

/** The questions as a tree of rows and branches, the same way the editor lays them out. */
export function buildTree<T extends TreeItem>(
  items: T[],
  from = 0,
  to = items.length,
  depth = 0,
): TreeRow[] {
  const rows: TreeRow[] = [];
  let i = from;
  while (i < to) {
    const split = depth < 6 ? lanesOf(items, i, to) : null;
    if (!split) {
      rows.push({ key: items[i]!.key, idx: i, lanes: [] });
      i++;
      continue;
    }
    rows.push({
      key: items[i]!.key,
      idx: i,
      lanes: split.lanes.map((l) => ({
        ...l,
        id: laneId(items[i]!.key, items[l.start]!.key),
        owner: items[i]!.key,
        rows: buildTree(items, l.start, l.end, depth + 1),
      })),
    });
    i = split.merge;
  }
  return rows;
}

/** Every container in the tree, keyed by id. */
export function containers<T extends TreeItem>(items: T[]): Map<string, Container> {
  const out = new Map<string, Container>();
  const visit = (rows: TreeRow[]) => {
    for (const r of rows)
      for (const l of r.lanes) {
        out.set(l.id, {
          id: l.id,
          owner: l.owner,
          values: l.values,
          start: l.start,
          end: l.end,
          rows: l.rows,
        });
        visit(l.rows);
      }
  };
  const rows = buildTree(items);
  out.set(MAIN, { id: MAIN, owner: null, values: [], start: 0, end: items.length, rows });
  visit(rows);
  return out;
}

/** The container a question sits in directly. */
export function containerOf<T extends TreeItem>(items: T[], key: string): Container | undefined {
  return [...containers(items).values()].find((c) => c.rows.some((r) => r.key === key));
}

/**
 * Moves question `key` into `container`, before the sibling `beforeKey` (or
 * last when null). Jumps and merge points are kept pointing at the same
 * branches: a branch whose first question moves away starts at its next
 * question, a question dropped first in a branch becomes its start, and a
 * question dropped right after a question with branches becomes where they meet.
 */
export function moveItem<T extends TreeItem>(
  list: T[],
  key: string,
  container: string,
  beforeKey: string | null,
): T[] {
  const from = list.findIndex((i) => i.key === key);
  if (from < 0 || key === beforeKey) return list;
  let items = list.map((i) => ({ ...i, jumps: { ...i.jumps } }));

  // 1. Point references to the moving question at whatever follows it.
  const next = items[from + 1]?.key;
  let target = container;
  items.forEach((o, oi) => {
    const split = lanesOf(items, oi);
    for (const [v, k] of Object.entries(o.jumps)) {
      if (k !== key) continue;
      const lane = split?.lanes.find((l) => l.start === from);
      const keep = v === MERGE ? !!next : !!lane && from + 1 < lane.end;
      if (keep && next) o.jumps[v] = next;
      else delete o.jumps[v];
    }
    if (container === laneId(o.key, key) && next) target = laneId(o.key, next);
  });

  // 2. Take it out and find where it goes.
  const moving = items[from]!;
  items = items.filter((i) => i.key !== key);
  const c = containers(items).get(target);
  if (!c) return list;
  const pos = beforeKey ? c.rows.findIndex((r) => r.key === beforeKey) : -1;
  const p = pos >= 0 ? pos : c.rows.length;
  const at = p < c.rows.length ? c.rows[p]!.idx : c.end;
  const neighbor = items[p < c.rows.length ? at : at - 1];
  const moved = { ...moving, section: neighbor?.section ?? moving.section } as T;
  const result = [...items.slice(0, at), moved, ...items.slice(at)] as T[];

  // 3. Keep it in the place it was dropped.
  const owner = c.owner ? result.find((i) => i.key === c.owner) : undefined;
  if (owner && p === 0) for (const v of c.values) owner.jumps[v] = key;
  const prev = p > 0 ? c.rows[p - 1] : undefined;
  if (prev?.lanes.length) {
    const o = result.find((i) => i.key === prev.key)!;
    o.jumps[MERGE] = key;
  }
  return result;
}
