import { describe, expect, it } from "vitest";
import { LIBRARY, libraryRows } from "./library";
import { MERGE, jumpKeys, visibleKeys, type FlowNode } from "./flow";

const call = LIBRARY.find((l) => l.key === "bokningssamtal")!;
const rows = libraryRows(call);

function nodes(): FlowNode[] {
  const keyAt = new Map(rows.map((r) => [r.position, `q${r.position}`]));
  return rows.map((r) => ({
    key: `q${r.position}`,
    label: r.label,
    type: r.type,
    required: r.required,
    options: r.options,
    parentKey: r.parent_position != null ? `q${r.parent_position}` : null,
    showWhen: r.show_when,
    section: r.section,
    ...(Object.keys(r.jump_to).length ? { jumps: jumpKeys(r.jump_to, keyAt) } : {}),
  }));
}

const sectionsShown = (answers: Record<string, unknown>) => {
  const vis = visibleKeys(nodes(), answers);
  return new Set(rows.filter((r) => vis.has(`q${r.position}`)).map((r) => r.section));
};

describe("library: inkommande bokningssamtal", () => {
  const typ = rows.find((r) => r.label === "Typ av bokning")!;

  it("jumps point at the first question of each branch and merge where branches meet", () => {
    for (const [value, pos] of Object.entries(typ.jump_to)) {
      if (value === MERGE) {
        expect(rows[pos]!.section).toBe("Sammanfatta");
        expect(rows[pos - 1]!.section).toBe("Reparation");
      } else {
        expect(rows[pos]!.section).toBe(value);
        expect(rows[pos - 1]!.section).not.toBe(value);
      }
    }
  });

  it("every parent reference points at a dropdown with that option", () => {
    for (const r of rows) {
      if (r.parent_position == null) continue;
      const parent = rows[r.parent_position]!;
      expect(parent.type).toBe("dropdown");
      expect(parent.options).toContain(r.show_when);
    }
  });

  it.each(["Lightbokning", "Service", "Reparation"])("%s shows only its own branch", (value) => {
    const shown = sectionsShown({ [`q${typ.position}`]: value });
    for (const branch of ["Lightbokning", "Service", "Reparation"]) {
      expect(shown.has(branch)).toBe(branch === value);
    }
    for (const common of ["INTRO", "Sammanfatta", "Pris och invändningar", "AVSLUT"]) {
      expect(shown.has(common)).toBe(true);
    }
  });

  it("objection answers show only their own reply", () => {
    const obj = rows.find((r) => r.label === "Invändning")!;
    const vis = visibleKeys(nodes(), {
      [`q${typ.position}`]: "Service",
      [`q${obj.position}`]: "Det var dyrt",
    });
    const replies = rows.filter((r) => r.parent_position === obj.position);
    expect(replies.length).toBe(5);
    expect(replies.filter((r) => vis.has(`q${r.position}`)).map((r) => r.label)).toEqual([
      "Svar: det var dyrt",
    ]);
  });
});
