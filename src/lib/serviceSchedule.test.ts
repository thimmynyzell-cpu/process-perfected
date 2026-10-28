import { isHalfYear, kmHits, KM_INTERVALS, monthsToYear, servicesForYear } from "./serviceSchedule";

const labels = (year: number) => servicesForYear(year).map((s) => s.label);

describe("monthsToYear", () => {
  it("rounds to the nearest year, halves up", () => {
    expect(monthsToYear(36)).toBe(3);
    expect(monthsToYear(41)).toBe(3);
    expect(monthsToYear(42)).toBe(4);
    expect(monthsToYear(3)).toBe(0);
  });
});

describe("isHalfYear", () => {
  it("is true only exactly midway between two years", () => {
    expect(isHalfYear(42)).toBe(true);
    expect(isHalfYear(6)).toBe(true);
    expect(isHalfYear(41)).toBe(false);
    expect(isHalfYear(48)).toBe(false);
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

describe("kmHits", () => {
  const hitting = (km: number) => KM_INTERVALS.filter((n) => kmHits(km, n).length > 0);

  it("takes everything that falls between km-10 000 and km+10 000", () => {
    expect(hitting(90_000)).toEqual([
      10_000, 20_000, 30_000, 40_000, 50_000, 80_000, 90_000, 100_000,
    ]);
    expect(kmHits(90_000, 20_000)).toEqual([80_000, 100_000]);
    expect(kmHits(90_000, 60_000)).toEqual([]);
  });
  it("never counts km 0", () => {
    expect(hitting(0)).toEqual([10_000]);
    expect(kmHits(5_000, 10_000)).toEqual([10_000]);
  });
});
