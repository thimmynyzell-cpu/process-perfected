import { monthsToYear, servicesForYear } from "./serviceSchedule";

const labels = (year: number) => servicesForYear(year).map((s) => s.label);

describe("monthsToYear", () => {
  it("rounds to the nearest year, halves up", () => {
    expect(monthsToYear(36)).toBe(3);
    expect(monthsToYear(41)).toBe(3);
    expect(monthsToYear(42)).toBe(4);
    expect(monthsToYear(3)).toBe(0);
  });
});

describe("servicesForYear", () => {
  it("matches the rows on the printed sheet", () => {
    expect(labels(1)).toEqual([]);
    expect(labels(3)).toEqual(["36, sedan var 24:e", "36"]);
    expect(labels(12)).toEqual(["24", "36", "48", "72"]);
    expect(labels(30)).toEqual(["24", "36", "60", "72"]);
    expect(labels(31)).toEqual(["36, sedan var 24:e"]);
    expect(labels(32)).toEqual(["24", "48"]);
  });
});
