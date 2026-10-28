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

export function servicesForYear(year: number): ExtraService[] {
  return EXTRA_SERVICES.filter(
    (s) => year >= s.firstYear && (year - s.firstYear) % s.everyYears === 0,
  );
}

// Körsträcksintervall: varje 10 000 km, 20 000 km … upp till 150 000 km.
export const KM_STEP = 10_000;
export const KM_INTERVALS: number[] = Array.from({ length: 15 }, (_, i) => (i + 1) * KM_STEP);

// Mätarställningen räknas som närmaste 10 000 km (±5 000 km), halva uppåt.
export function roundKm(km: number): number {
  return Math.max(0, Math.round(km / KM_STEP) * KM_STEP);
}

export function kmIntervalsFor(km: number): number[] {
  const rounded = roundKm(km);
  return rounded === 0 ? [] : KM_INTERVALS.filter((n) => rounded % n === 0);
}
