import { applyBaseChange, concatItems, pickItems, reorder } from "./items";

const item = (id: string, position: number, extra = {}) => ({
  id,
  position,
  parent_position: null as number | null,
  show_when: null as string | null,
  jump_to: {} as unknown,
  ...extra,
});

describe("pickItems", () => {
  it("renumbers kept items and remaps conditions and jumps", () => {
    const items = [
      item("a", 0, { jump_to: { Ja: 2, Nej: 3 } }),
      item("b", 1),
      item("c", 2, { parent_position: 0, show_when: "Ja" }),
      item("d", 3, { parent_position: 1, show_when: "true" }),
    ];
    const out = pickItems(items, new Set(["a", "c", "d"]));
    expect(out.map((i) => [i.id, i.position])).toEqual([
      ["a", 0],
      ["c", 1],
      ["d", 2],
    ]);
    expect(out[0]!.jump_to).toEqual({ Ja: 1, Nej: 2 });
    expect(out[1]).toMatchObject({ parent_position: 0, show_when: "Ja" });
    // d's parent b was dropped
    expect(out[2]).toMatchObject({ parent_position: null, show_when: null });
  });

  it("drops jumps to removed items and keeps rows without jump_to untouched", () => {
    const out = pickItems([item("a", 0, { jump_to: { Ja: 1 } }), item("b", 1)], new Set(["a"]));
    expect(out[0]!.jump_to).toEqual({});
    const { jump_to: _j, ...noJump } = item("x", 0);
    expect(pickItems([noJump], new Set(["x"]))[0]).not.toHaveProperty("jump_to");
  });
});

describe("reorder", () => {
  const list = ["a", "b", "c", "d"].map((key) => ({ key }));
  const keys = (l: { key: string }[]) => l.map((i) => i.key).join("");
  it("moves an item before or after another", () => {
    expect(keys(reorder(list, "a", "c", false))).toBe("bacd");
    expect(keys(reorder(list, "a", "c", true))).toBe("bcad");
    expect(keys(reorder(list, "d", "a", false))).toBe("dabc");
    expect(keys(reorder(list, "b", "b", true))).toBe("abcd");
  });
});

describe("concatItems", () => {
  it("shifts positions, conditions and jumps of the second list", () => {
    const a = pickItems([item("a", 0), item("b", 1)], new Set(["a", "b"]));
    const b = pickItems(
      [item("c", 0, { jump_to: { Ja: 1 } }), item("d", 1, { parent_position: 0, show_when: "Ja" })],
      new Set(["c", "d"]),
    );
    const out = concatItems(a, b);
    expect(out.map((i) => [i.id, i.position])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
      ["d", 3],
    ]);
    expect(out[2]!.jump_to).toEqual({ Ja: 3 });
    expect(out[3]).toMatchObject({ parent_position: 2, show_when: "Ja" });
  });
});

describe("applyBaseChange", () => {
  const base = (key: string, position: number, label: string, extra = {}) => ({
    ...item(`b-${key}`, position),
    item_key: key,
    label,
    required: false,
    ...extra,
  });
  const own = (id: string, position: number, label: string, extra = {}) => ({
    ...item(id, position),
    item_key: `k-${id}`,
    base_key: null as string | null,
    label,
    required: false,
    ...extra,
  });

  const oldBase = [
    base("A", 0, "Identitet"),
    base("B", 1, "Ärendenummer"),
    base("C", 2, "Bekräftelse"),
  ];

  it("updates linked questions, removes deleted ones and adds new ones after the last linked", () => {
    const items = [
      own("1", 0, "Identitet", { base_key: "A" }),
      own("2", 1, "Ärendenummer", { base_key: "B" }),
      own("3", 2, "Egen fråga", { jump_to: { true: 3 } }),
      own("4", 3, "Bekräftelse", { base_key: "C" }),
    ];
    const newBase = [
      base("A", 0, "Kontrollera identitet", { required: true }),
      base("C", 1, "Bekräftelse"),
      base("D", 2, "Ny grundfråga"),
    ];
    const out = applyBaseChange(items, oldBase, newBase)!;
    expect(out.map((i) => i.label)).toEqual([
      "Kontrollera identitet",
      "Egen fråga",
      "Bekräftelse",
      "Ny grundfråga",
    ]);
    expect(out[0]).toMatchObject({ required: true, base_key: "A", item_key: "k-1" });
    // the own question's jump to "Bekräftelse" follows it to its new position
    expect(out[1]!.jump_to).toEqual({ true: 2 });
    expect(out[3]).toMatchObject({ base_key: "D", position: 3 });
    expect(out[3]).not.toHaveProperty("item_key");
  });

  it("links older copies by their text and returns null when nothing changed", () => {
    const items = [own("1", 0, "identitet "), own("2", 1, "Ärendenummer", { base_key: "B" })];
    const same = applyBaseChange(items, oldBase.slice(0, 2), oldBase.slice(0, 2));
    // nothing changed in content, but the text match gets linked
    expect(same?.[0]).toMatchObject({ base_key: "A" });
    const linked = [own("1", 0, "Identitet", { base_key: "A" })];
    expect(applyBaseChange(linked, [oldBase[0]!], [oldBase[0]!])).toBeNull();
  });

  it("leaves checklists that don't use the base alone", () => {
    expect(applyBaseChange([own("1", 0, "Helt annan")], oldBase, oldBase)).toBeNull();
    const withNew = [...oldBase, base("D", 3, "Ny grundfråga")];
    expect(applyBaseChange([own("1", 0, "Helt annan")], oldBase, withNew)).toBeNull();
  });
});
