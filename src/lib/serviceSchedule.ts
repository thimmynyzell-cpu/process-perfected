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

// Körsträcksintervall: bara var 10 000 km (10 000, 20 000 … upp till 150 000 km).
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

// Tillfällena first, first + every, … som ligger i fönstret [lo, hi]. Utan `every` finns
// bara tillfället `first`. Månadsfönster är öppna nedåt (lo räknas inte), km-fönster slutna.
function occurrences(
  first: number,
  every: number | null,
  lo: number,
  hi: number,
  loInclusive: boolean,
): number[] {
  const inside = (k: number) => k <= hi && (loInclusive ? k >= lo : k > lo) && k > 0;
  if (every === null) return inside(first) ? [first] : [];
  const hits: number[] = [];
  let j = Math.max(0, Math.ceil((lo - first) / every));
  for (let k = first + j * every; k <= hi && hits.length < 1000; k = first + ++j * every) {
    if (inside(k)) hits.push(k);
  }
  return hits;
}

// Ett eget intervall med en månadsdel och/eller en kilometerdel, t.ex. "120 mån och
// därefter varje 60 mån" och "35 000 km och därefter varje 120 000 km".
export type Manual = {
  monthFirst: number | null;
  monthEvery: number | null;
  kmFirst: number | null;
  kmEvery: number | null;
};

// Tillfällena per del, eller null för en del som inte används eller inte går att räkna
// ännu (åldern eller mätarställningen saknas).
// Första gång och intervall för en del. Fylls bara ett av dem i gäller det som båda, så
// "48" betyder var 48:e (48, 96, 144 …). Null om inget (giltigt) är ifyllt.
export function normalizeInterval(
  first: number | null,
  every: number | null,
): { first: number; every: number } | null {
  const f = first !== null && first > 0 ? first : null;
  const e = every !== null && every > 0 ? every : null;
  const both = f ?? e;
  return both === null ? null : { first: both, every: e ?? both };
}

// Tillfällena per del, eller null för en del som inte används eller inte går att räkna
// ännu (åldern eller mätarställningen saknas).
export function manualHits(
  m: Manual,
  ctx: { year: number | null; km: number | null },
): { months: number[] | null; km: number[] | null } {
  const mo = normalizeInterval(m.monthFirst, m.monthEvery);
  const k = normalizeInterval(m.kmFirst, m.kmEvery);
  return {
    months:
      mo === null || ctx.year === null
        ? null
        : occurrences(mo.first, mo.every, (ctx.year - 1) * 12, ctx.year * 12, false),
    km:
      k === null || ctx.km === null
        ? null
        : occurrences(k.first, k.every, Math.max(0, ctx.km - KM_STEP), ctx.km + KM_STEP, true),
  };
}

// Hur många gånger intervallet då har genomförts, räknat med tillfället `hit`.
export function occurrenceFrom(first: number, every: number | null, hit: number): number {
  return every === null ? 1 : Math.round((hit - first) / every) + 1;
}

// Hur många gånger ett intervall har genomförts fram till `upTo` (månader eller km).
export function timesDone(first: number, every: number | null, upTo: number): number {
  if (upTo < first) return 0;
  return every === null ? 1 : Math.floor((upTo - first) / every) + 1;
}

// För ett eget intervall med både månader och km: vilket av dem som har genomförts flest
// gånger, och alltså ska gälla. Åldern räknas till slutet av valt år och mätarställningen
// till den faktiska mätarställningen (utan ±10 000 km). Null om någon del saknas eller inte går att
// räkna ännu.
export function manualBasis(
  m: Manual,
  ctx: { year: number | null; km: number | null },
): { months: number; km: number; choice: "months" | "km" | "equal" } | null {
  const mo = normalizeInterval(m.monthFirst, m.monthEvery);
  const k = normalizeInterval(m.kmFirst, m.kmEvery);
  if (mo === null || k === null || ctx.year === null || ctx.km === null) return null;
  const months = timesDone(mo.first, mo.every, ctx.year * 12);
  const km = timesDone(k.first, k.every, ctx.km);
  return { months, km, choice: months === km ? "equal" : months > km ? "months" : "km" };
}

// Senaste tillfället som har passerat (<= at) och nästa som kommer (> at), eller null
// åt det håll där det inte finns något (före första gången respektive aldrig för prev).
export function surroundingOccurrences(
  first: number,
  every: number,
  at: number,
): { prev: number | null; next: number } {
  if (at < first) return { prev: null, next: first };
  const prev = first + Math.floor((at - first) / every) * every;
  return { prev, next: prev + every };
}
