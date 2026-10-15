import { pickItems } from "./items";

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
