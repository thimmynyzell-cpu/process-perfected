import { sectionOrder } from "./sections";

describe("sectionOrder", () => {
  it("puts INTRO first, AVSLUT last and the rest in order of appearance", () => {
    expect(sectionOrder(["Utredning", "AVSLUT", "", "INTRO", "Beslut", "Utredning", null])).toEqual([
      "INTRO",
      "Utredning",
      "Beslut",
      "AVSLUT",
    ]);
  });
  it("adds the defaults when asked", () => {
    expect(sectionOrder(["Mitten"], true)).toEqual(["INTRO", "Mitten", "AVSLUT"]);
    expect(sectionOrder([])).toEqual([]);
  });
});
