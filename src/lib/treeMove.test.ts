import { MERGE } from "./flow";
import { MAIN, buildTree, containerOf, laneId, moveItem, type TreeItem } from "./treeMove";

const q = (key: string, jumps: Record<string, string> = {}, section = "S"): TreeItem => ({
  key,
  section,
  jumps,
});
// q: A → a1 a2, B → b1; then end
const base = () => [q("q", { A: "a1", B: "b1", [MERGE]: "m" }), q("a1"), q("a2"), q("b1"), q("m")];
const shape = (items: TreeItem[]) =>
  buildTree(items).map((r) =>
    r.lanes.length
      ? `${r.key}[${r.lanes.map((l) => l.rows.map((x) => x.key).join(",")).join("|")}]`
      : r.key,
  );

describe("moveItem", () => {
  it("builds the tree", () => {
    expect(shape(base())).toEqual(["q[a1,a2|b1]", "m"]);
  });

  it("moves a question from one branch to another", () => {
    const out = moveItem(base(), "a2", laneId("q", "b1"), null);
    expect(shape(out)).toEqual(["q[a1|b1,a2]", "m"]);
  });

  it("keeps a branch when its first question moves out", () => {
    const out = moveItem(base(), "a1", MAIN, null);
    expect(shape(out)).toEqual(["q[a2|b1]", "m", "a1"]);
    expect(out[0]!.jumps["A"]).toBe("a2");
  });

  it("makes a question dropped first in a branch its start", () => {
    const out = moveItem(base(), "m", laneId("q", "a1"), "a1");
    // m was the merge point; nothing follows it, so the merge falls back to the end
    expect(shape(out)).toEqual(["q[m,a1,a2|b1]"]);
    expect(out[0]!.jumps["A"]).toBe("m");
  });

  it("drops right after a branching question into the main flow", () => {
    const items = [...base(), q("z")];
    const out = moveItem(items, "z", MAIN, "m");
    expect(shape(out)).toEqual(["q[a1,a2|b1]", "z", "m"]);
    expect(out[0]!.jumps[MERGE]).toBe("z");
    expect(containerOf(out, "z")?.id).toBe(MAIN);
  });

  it("moves a question out of a branch into the main flow before another", () => {
    const out = moveItem(base(), "b1", MAIN, "m");
    // B's branch is empty now, so B no longer jumps
    expect(shape(out)).toEqual(["q[a1,a2]", "b1", "m"]);
    expect(out[0]!.jumps["B"]).toBeUndefined();
  });
});
