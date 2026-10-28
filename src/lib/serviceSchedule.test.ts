import { kmIntervalsFor, monthsToYear, roundKm, servicesForYear } from "./serviceSchedule";

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

describe("kmIntervalsFor", () => {
  it("rounds the odometer to the nearest 10 000 km", () => {
    expect(roundKm(94_999)).toBe(90_000);
    expect(roundKm(95_000)).toBe(100_000);
  });
  it("returns every interval that the rounded reading hits", () => {
    expect(kmIntervalsFor(5_000 - 1)).toEqual([]);
    expect(kmIntervalsFor(10_000)).toEqual([10_000]);
    expect(kmIntervalsFor(60_000)).toEqual([10_000, 20_000, 30_000, 60_000]);
    expect(kmIntervalsFor(150_000)).toEqual([10_000, 30_000, 50_000, 150_000]);
  });
});
