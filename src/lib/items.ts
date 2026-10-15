type ItemRow = {
  id: string;
  position: number;
  parent_position: number | null;
  show_when: string | null;
  jump_to?: unknown;
};

/**
 * Keeps the chosen items in order and renumbers their positions. Conditions
 * and jumps that point at a dropped item are removed.
 */
export function pickItems<T extends ItemRow>(items: T[], keep: Set<string>): T[] {
  const kept = [...items].sort((a, b) => a.position - b.position).filter((i) => keep.has(i.id));
  const newPos = new Map(kept.map((i, idx) => [i.position, idx]));
  return kept.map((i, idx) => {
    const parent = i.parent_position != null ? newPos.get(i.parent_position) : undefined;
    const out: T = {
      ...i,
      position: idx,
      parent_position: parent ?? null,
      show_when: parent !== undefined ? i.show_when : null,
    };
    if (i.jump_to && typeof i.jump_to === "object") {
      out.jump_to = Object.fromEntries(
        Object.entries(i.jump_to).flatMap(([v, pos]) => {
          const target = typeof pos === "number" ? newPos.get(pos) : undefined;
          return target !== undefined ? [[v, target]] : [];
        }),
      );
    }
    return out;
  });
}

/** Moves the item with key `from` so it lands before (or after) the item with key `to`. */
export function reorder<T extends { key: string }>(
  list: T[],
  from: string,
  to: string,
  after: boolean,
): T[] {
  if (from === to) return list;
  const moving = list.find((i) => i.key === from);
  if (!moving) return list;
  const rest = list.filter((i) => i.key !== from);
  const at = rest.findIndex((i) => i.key === to);
  if (at < 0) return list;
  rest.splice(after ? at + 1 : at, 0, moving);
  return rest;
}
