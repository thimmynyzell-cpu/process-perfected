import { lanesOf, visibleKeys, type FlowNode } from "./flow";

const node = (key: string, extra: Partial<FlowNode> = {}): FlowNode => ({
  key,
  label: key,
  type: "text",
  required: false,
  options: [],
  parentKey: null,
  showWhen: null,
  ...extra,
});

// q4 jumps to q5 on "A" and to q8 on "B".
const nodes = [
  node("q1"),
  node("q4", { type: "dropdown", options: ["A", "B"], jumps: { A: "q5", B: "q8" } }),
  node("q5"),
  node("q6"),
  node("q7"),
  node("q8"),
  node("q9"),
];
const keys = (answers: Record<string, unknown>) => [...visibleKeys(nodes, answers)];

describe("jumps", () => {
  it("shows everything before the question is answered", () => {
    expect(keys({})).toEqual(["q1", "q4", "q5", "q6", "q7", "q8", "q9"]);
  });

  it("continues at the jump target", () => {
    // A's branch ends where B's starts; with no sections the branches meet at the end
    expect(keys({ q4: "A" })).toEqual(["q1", "q4", "q5", "q6", "q7"]);
    expect(keys({ q4: "B" })).toEqual(["q1", "q4", "q8", "q9"]);
  });

  it("uses the earliest target when several checkbox options are checked", () => {
    const cb = [
      node("a", { type: "checkbox", options: ["X", "Y"], jumps: { X: "d", Y: "c" } }),
      node("b"),
      node("c"),
      node("d"),
    ];
    expect([...visibleKeys(cb, { a: ["X"] })]).toEqual(["a", "d"]);
    expect([...visibleKeys(cb, { a: ["X", "Y"] })]).toEqual(["a", "c", "d"]);
  });

  it("jumps on a yes/no checkbox", () => {
    const yn = [node("a", { type: "checkbox", jumps: { true: "c" } }), node("b"), node("c")];
    expect([...visibleKeys(yn, { a: true })]).toEqual(["a", "c"]);
    expect([...visibleKeys(yn, { a: false })]).toEqual(["a", "b", "c"]);
  });

  it("ignores jumps from skipped questions", () => {
    const n = [
      node("a", { type: "dropdown", options: ["A"], jumps: { A: "c" } }),
      node("b", { type: "dropdown", options: ["B"], jumps: { B: "d" } }),
      node("c"),
      node("d"),
    ];
    expect([...visibleKeys(n, { a: "A", b: "B" })]).toEqual(["a", "c", "d"]);
  });
});

describe("hidden nodes", () => {
  it("hides a node and continues past a jump target that is hidden", () => {
    const n = [
      node("a", { type: "dropdown", options: ["A"], jumps: { A: "c" } }),
      node("b"),
      node("c", { hidden: true }),
      node("d"),
    ];
    expect([...visibleKeys(n, {})]).toEqual(["a", "b", "d"]);
    expect([...visibleKeys(n, { a: "A" })]).toEqual(["a", "d"]);
  });
});

describe("lanesOf", () => {
  const sec = (key: string, section: string, extra: Partial<FlowNode> = {}) =>
    node(key, { section, ...extra });
  const nodes = [
    sec("q4", "UTREDNING", { type: "dropdown", options: ["A", "B"], jumps: { A: "q5", B: "q8" } }),
    sec("q5", "UTREDNING"),
    sec("q6", "UTREDNING"),
    sec("q8", "UTREDNING"),
    sec("q9", "UTREDNING"),
    sec("q10", "AVSLUT"),
  ];
  it("gives each jump a branch that ends where the next starts and meets at the section end", () => {
    expect(lanesOf(nodes, 0)).toEqual({
      lanes: [
        { values: ["A"], start: 1, end: 3 },
        { values: ["B"], start: 3, end: 5 },
      ],
      merge: 5,
    });
  });
  it("continues after the branches where they meet", () => {
    expect([...visibleKeys(nodes, { q4: "A" })]).toEqual(["q4", "q5", "q6", "q10"]);
    expect([...visibleKeys(nodes, { q4: "B" })]).toEqual(["q4", "q8", "q9", "q10"]);
  });
});
