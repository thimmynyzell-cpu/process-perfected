import {
  ageRule,
  manualHits,
  occurrenceFrom,
  occurrenceNumber,
  ordinal,
  EXTRA_SERVICES,
  kmRule,
  ruleHits,
  isHalfYear,
  yearChoices,
  kmHits,
  KM_INTERVALS,
  monthsToYear,
  servicesForYear,
} from "./serviceSchedule";

const labels = (year: number) => servicesForYear(year).map((s) => s.label);

describe("monthsToYear", () => {
  it("rounds to the nearest year, halves up", () => {
    expect(monthsToYear(36)).toBe(3);
    expect(monthsToYear(41)).toBe(3);
    expect(monthsToYear(42)).toBe(4);
    expect(monthsToYear(3)).toBe(0);
  });
});

describe("yearChoices", () => {
  it("offers the year below and above unless the months are a whole year", () => {
    expect(yearChoices(42)).toEqual([3, 4]);
    expect(yearChoices(140)).toEqual([11, 12]);
    expect(yearChoices(144)).toEqual([12]);
    expect(yearChoices(5)).toEqual([0, 1]);
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
      5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 40_000, 45_000, 50_000, 80_000, 85_000, 90_000,
      95_000, 100_000,
    ]);
    expect(kmHits(90_000, 20_000)).toEqual([80_000, 100_000]);
    expect(kmHits(90_000, 60_000)).toEqual([]);
  });
  it("never counts km 0", () => {
    expect(hitting(0)).toEqual([5_000, 10_000]);
    expect(kmHits(5_000, 10_000)).toEqual([10_000]);
  });
});

describe("ruleHits", () => {
  const none = { year: null, km: null };

  it("gives the same answer as the printed sheet for the standard age rules", () => {
    for (let year = 1; year <= 32; year++) {
      const fromRules = EXTRA_SERVICES.filter(
        (s) => ruleHits(ageRule(s), { year, km: null })!.length > 0,
      );
      expect(fromRules).toEqual(servicesForYear(year));
    }
  });

  it("counts a custom month interval in the year it falls", () => {
    const rule = { first: 36, every: 18, unit: "months" as const };
    expect(ruleHits(rule, { year: 3, km: null })).toEqual([36]);
    expect(ruleHits(rule, { year: 4, km: null })).toEqual([]);
    expect(ruleHits(rule, { year: 5, km: null })).toEqual([54]);
  });

  it("uses the interval as first occurrence when no first is given", () => {
    expect(ruleHits({ first: null, every: 18, unit: "months" }, { year: 2, km: null })).toEqual([
      18,
    ]);
  });

  it("counts a custom km interval within ±10 000 km", () => {
    const rule = { first: null, every: 25_000, unit: "km" as const };
    expect(ruleHits(rule, { year: null, km: 70_000 })).toEqual([75_000]);
    expect(ruleHits(rule, { year: null, km: 52_000 })).toEqual([50_000]);
    expect(ruleHits(kmRule(45_000), { year: null, km: 90_000 })).toEqual([90_000]);
  });

  it("returns null while the age or km it needs is missing", () => {
    expect(ruleHits(ageRule(EXTRA_SERVICES[0]!), none)).toBeNull();
    expect(ruleHits(kmRule(10_000), none)).toBeNull();
  });
});

describe("occurrenceNumber", () => {
  it("counts how many times the interval has been done", () => {
    // 10 år, var 24:e månad: 120 månader är 5:e gången
    const rule = ageRule(EXTRA_SERVICES[0]!);
    const hit = ruleHits(rule, { year: 10, km: null })![0]!;
    expect(occurrenceNumber(rule, hit)).toBe(5);
    expect(occurrenceNumber(ageRule(EXTRA_SERVICES[1]!), 36)).toBe(1);
    expect(occurrenceNumber({ first: 36, every: 18, unit: "months" }, 54)).toBe(2);
    expect(occurrenceNumber(kmRule(30_000), 90_000)).toBe(3);
    expect(occurrenceNumber(kmRule(10_000), 80_000)).toBe(8);
  });
});

describe("ordinal", () => {
  it("writes Swedish ordinals", () => {
    expect([1, 2, 3, 4, 5, 11, 12, 21, 22, 23].map(ordinal)).toEqual([
      "1:a",
      "2:a",
      "3:e",
      "4:e",
      "5:e",
      "11:e",
      "12:e",
      "21:a",
      "22:a",
      "23:e",
    ]);
  });
});

describe("manualHits", () => {
  const manual = { monthFirst: 120, monthEvery: 60, kmFirst: 35_000, kmEvery: 120_000 };

  it("counts 120 months and then every 60 months", () => {
    expect(manualHits(manual, { year: 10, km: null }).months).toEqual([120]);
    expect(manualHits(manual, { year: 11, km: null }).months).toEqual([]);
    expect(manualHits(manual, { year: 15, km: null }).months).toEqual([180]);
  });

  it("counts 35 000 km and then every 120 000 km, within ±10 000 km", () => {
    expect(manualHits(manual, { year: null, km: 40_000 }).km).toEqual([35_000]);
    expect(manualHits(manual, { year: null, km: 100_000 }).km).toEqual([]);
    expect(manualHits(manual, { year: null, km: 150_000 }).km).toEqual([155_000]);
  });

  it("handles months and km on the same interval", () => {
    expect(manualHits(manual, { year: 10, km: 40_000 })).toEqual({ months: [120], km: [35_000] });
  });

  it("gives only the first occurrence when no interval follows", () => {
    const once = { monthFirst: 120, monthEvery: null, kmFirst: null, kmEvery: null };
    expect(manualHits(once, { year: 10, km: 1 })).toEqual({ months: [120], km: null });
    expect(manualHits(once, { year: 15, km: 1 }).months).toEqual([]);
  });

  it("uses the interval as first occurrence when no first is given", () => {
    const m = { monthFirst: null, monthEvery: 18, kmFirst: null, kmEvery: null };
    expect(manualHits(m, { year: 2, km: null }).months).toEqual([18]);
  });

  it("returns null for a part that is unused or lacks age or km", () => {
    expect(manualHits(manual, { year: null, km: null })).toEqual({ months: null, km: null });
    const empty = { monthFirst: null, monthEvery: null, kmFirst: null, kmEvery: null };
    expect(manualHits(empty, { year: 10, km: 40_000 })).toEqual({ months: null, km: null });
  });

  it("numbers the occurrence", () => {
    expect(occurrenceFrom(120, 60, 120)).toBe(1);
    expect(occurrenceFrom(120, 60, 180)).toBe(2);
    expect(occurrenceFrom(35_000, 120_000, 155_000)).toBe(2);
    expect(occurrenceFrom(120, null, 120)).toBe(1);
  });
});
