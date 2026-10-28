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

// Åren att välja mellan: det hela året under och över, eller bara året om antalet
// månader går jämnt ut. Det närmaste året står sist vid ett halvt år (uppåt).
export function yearChoices(months: number): number[] {
  const m = Math.max(0, months);
  const lower = Math.floor(m / 12);
  return m % 12 === 0 ? [lower] : [lower, lower + 1];
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

// Körsträcksintervall: varje 10 000 km, 20 000 km … upp till 150 000 km, samt 15 000 och 45 000.
export const KM_STEP = 10_000;
// 15 000 och 45 000 km förekommer ofta och är med bland de vanliga intervallen.
export const KM_INTERVALS: number[] = [
  ...Array.from({ length: 15 }, (_, i) => (i + 1) * KM_STEP),
  15_000,
  45_000,
].sort((a, b) => a - b);

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

// En regel säger när en service ska göras: första gången och sedan med fast intervall,
// räknat i månader eller i km. Utan `first` är första gången lika med intervallet.
export type Rule = { first: number | null; every: number; unit: "months" | "km" };

export function ageRule(s: ExtraService): Rule {
  return { first: s.firstYear * 12, every: s.everyYears * 12, unit: "months" };
}

export function kmRule(interval: number): Rule {
  return { first: null, every: interval, unit: "km" };
}

// Tillfällen (månader) som infaller under år `year`, alltså de 12 månader som
// slutar vid year * 12.
function monthHits(first: number, every: number, year: number): number[] {
  const lo = (year - 1) * 12;
  const hi = year * 12;
  const hits: number[] = [];
  let k = first > lo ? first : first + Math.floor((lo - first) / every + 1) * every;
  for (; k <= hi; k += every) hits.push(k);
  return hits;
}

// Tillfällena som regeln ger för kunden, eller null om det som behövs (år eller km)
// ännu inte är angivet.
export function ruleHits(
  rule: Rule,
  ctx: { year: number | null; km: number | null },
): number[] | null {
  if (!(rule.every > 0)) return [];
  if (rule.unit === "km") return ctx.km === null ? null : kmHits(ctx.km, rule.every);
  return ctx.year === null ? null : monthHits(rule.first ?? rule.every, rule.every, ctx.year);
}

// Svenskt ordningstal: 1:a, 2:a, 3:e … 11:e, 12:e, 21:a.
export function ordinal(n: number): string {
  const a = (n % 10 === 1 || n % 10 === 2) && n % 100 !== 11 && n % 100 !== 12;
  return `${n}:${a ? "a" : "e"}`;
}

// Hur många gånger intervallet då har genomförts, räknat med tillfället `hit`
// (månader eller km, som ruleHits ger).
export function occurrenceNumber(rule: Rule, hit: number): number {
  return rule.unit === "km"
    ? Math.round(hit / rule.every)
    : Math.round((hit - (rule.first ?? rule.every)) / rule.every) + 1;
}
