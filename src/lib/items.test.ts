import { concatItems, pickItems, reorder } from "./items";

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
