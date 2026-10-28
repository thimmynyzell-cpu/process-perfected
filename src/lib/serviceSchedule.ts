// Tilläggsservicar från hjälplappen. Varje kolumn gäller från ett visst år och
// återkommer sedan med ett fast antal år emellan.
export type ExtraService = { label: string; firstYear: number; everyYears: number };

export const EXTRA_SERVICES: ExtraService[] = [
  { label: "24", firstYear: 2, everyYears: 2 },
  { label: "36, sedan var 24:e", firstYear: 3, everyYears: 2 },
  { label: "36", firstYear: 3, everyYears: 3 },
  { label: "48", firstYear: 4, everyYears: 4 },
  { label: "60", firstYear: 5, everyYears: 5 },
  { label: "72", firstYear: 6, everyYears: 6 },
];

// Avrundar till närmaste hela år; ett halvt år avrundas uppåt.
export function monthsToYear(months: number): number {
  return Math.max(0, Math.round(months / 12));
}

// Exakt mitt emellan två år (6 månader över ett helt år), t.ex. 42 månader.
export function isHalfYear(months: number): boolean {
  return months >= 0 && months % 12 === 6;
}

export function servicesForYear(year: number): ExtraService[] {
  return EXTRA_SERVICES.filter(
    (s) => year >= s.firstYear && (year - s.firstYear) % s.everyYears === 0,
  );
}

// Körsträcksintervall: varje 10 000 km, 20 000 km … upp till 150 000 km.
export const KM_STEP = 10_000;
export const KM_INTERVALS: number[] = Array.from({ length: 15 }, (_, i) => (i + 1) * KM_STEP);

// Alla mätarställningar där intervallet infaller inom ±10 000 km från kundens
// mätarställning (gränserna räknas med).
export function kmHits(km: number, interval: number): number[] {
  const lo = Math.max(0, km - KM_STEP);
  const hi = km + KM_STEP;
  const hits: number[] = [];
  for (let m = Math.max(interval, Math.ceil(lo / interval) * interval); m <= hi; m += interval) {
    hits.push(m);
  }
  return hits;
}
