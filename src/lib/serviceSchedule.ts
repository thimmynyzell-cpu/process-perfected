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
