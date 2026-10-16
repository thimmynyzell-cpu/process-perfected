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

/** Appends `b` after `a`, shifting b's positions and the positions its conditions and jumps refer to. */
export function concatItems<T extends ItemRow>(a: T[], b: T[]): T[] {
  const offset = a.length;
  const shifted = b.map((i) => {
    const out: T = {
      ...i,
      position: i.position + offset,
      parent_position: i.parent_position != null ? i.parent_position + offset : null,
    };
    if (i.jump_to && typeof i.jump_to === "object") {
      out.jump_to = Object.fromEntries(
        Object.entries(i.jump_to).map(([v, pos]) => [
          v,
          typeof pos === "number" ? pos + offset : pos,
        ]),
      );
    }
    return out;
  });
  return [...a, ...shifted];
}

/** Folder name for a checklist's category; empty means no folder. */
export const folderOf = (category: string | null | undefined) => (category ?? "").trim();

/** Fields a base checklist question passes on to the checklists that use it. */
export const BASE_FIELDS = [
  "label",
  "help_text",
  "type",
  "options",
  "required",
  "allow_note",
  "allow_photo",
  "levels",
] as const;

type LinkedRow = ItemRow & {
  label: string;
  item_key?: string | null;
  base_key?: string | null;
  [field: string]: unknown;
};

const sameLabel = (a: unknown, b: unknown) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Applies a change in a base checklist to a checklist that uses it. Linked
 * questions get the base's new content, questions removed from the base are
 * removed, and new base questions are added after the last linked one.
 * Questions copied before links existed are matched by their text. Returns
 * null when nothing changes.
 */
export function applyBaseChange<T extends LinkedRow>(
  items: T[],
  oldBase: LinkedRow[],
  newBase: LinkedRow[],
): Omit<T, "id">[] | null {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const oldKeys = new Set(oldBase.map((b) => b.item_key).filter(Boolean));
  const newByKey = new Map(newBase.map((b) => [b.item_key, b]));
  const linkOf = (i: T) => {
    if (i.base_key && oldKeys.has(i.base_key)) return i.base_key;
    if (!i.base_key) return oldBase.find((b) => sameLabel(b.label, i.label))?.item_key ?? null;
    return null;
  };

  let changed = false;
  let lastLinked = -1;
  const kept: { row: T; oldPos: number | null }[] = [];
  for (const i of sorted) {
    const link = linkOf(i);
    if (!link) {
      kept.push({ row: i, oldPos: i.position });
      continue;
    }
    const b = newByKey.get(link);
    if (!b) {
      changed = true; // removed from the base
      continue;
    }
    const next = { ...i, base_key: link } as T;
    for (const f of BASE_FIELDS) {
      if (JSON.stringify(next[f]) !== JSON.stringify(b[f])) {
        (next as Record<string, unknown>)[f] = b[f];
        changed = true;
      }
    }
    if (i.base_key !== link) changed = true;
    kept.push({ row: next, oldPos: i.position });
    lastLinked = kept.length - 1;
  }
  // Only checklists that use this base get its new questions.
  if (lastLinked < 0 && !changed) return null;

  const added = [...newBase]
    .sort((a, b) => a.position - b.position)
    .filter((b) => b.item_key && !oldKeys.has(b.item_key));
  if (added.length) {
    changed = true;
    const rows = added.map((b) => {
      const row: Record<string, unknown> = {
        base_key: b.item_key,
        parent_position: null,
        show_when: null,
        jump_to: {},
      };
      for (const f of BASE_FIELDS) row[f] = b[f];
      return { row: row as T, oldPos: null };
    });
    kept.splice(lastLinked >= 0 ? lastLinked + 1 : kept.length, 0, ...rows);
  }
  if (!changed) return null;

  const newPos = new Map(
    kept.flatMap((k, idx) => (k.oldPos !== null ? [[k.oldPos, idx] as const] : [])),
  );
  return kept.map(({ row }, idx) => {
    const { id: _id, ...rest } = row as T & { id?: string };
    const parent = row.parent_position != null ? newPos.get(row.parent_position) : undefined;
    const out = {
      ...rest,
      position: idx,
      parent_position: parent ?? null,
      show_when: parent !== undefined ? row.show_when : null,
    } as Omit<T, "id">;
    if (row.jump_to && typeof row.jump_to === "object") {
      (out as unknown as LinkedRow).jump_to = Object.fromEntries(
        Object.entries(row.jump_to).flatMap(([v, pos]) => {
          const target = typeof pos === "number" ? newPos.get(pos) : undefined;
          return target !== undefined ? [[v, target]] : [];
        }),
      );
    }
    return out;
  });
}
