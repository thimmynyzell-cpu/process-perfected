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

// Åldern som hela år och månader, t.ex. 172 månader = "14 år och 4 månader".
export function formatAge(months: number): string {
  const total = Math.round(months * 10) / 10;
  const years = Math.floor(total / 12);
  const rest = Math.round((total - years * 12) * 10) / 10;
  const y = years === 0 ? null : `${years} år`;
  const m =
    rest === 0 ? null : `${String(rest).replace(".", ",")} ${rest === 1 ? "månad" : "månader"}`;
  return [y, m].filter(Boolean).join(" och ") || "0 månader";
}

// ---- Tilläggsservice i fritext ----
// Rader som kopierats från bokningssidan, t.ex. "Vid 105000 km eller 72 månader och sedan
// var 15000:e km eller 12:e månad (0,10 t)". Tiden inom parentes visas men räknas inte.

export type Interval = { first: number; every: number | null };

export type ParsedService = {
  // Raden som den visas, utan punkt eller stjärna först.
  text: string;
  months: Interval | null;
  km: Interval | null;
  // Satt när raden inte gick att tolka helt.
  warning: string | null;
};

const WORD_ORDINALS: Record<string, number> = {
  annat: 2,
  andra: 2,
  tredje: 3,
  fjärde: 4,
  femte: 5,
  sjätte: 6,
};

// Ett tal med enhet, t.ex. "15000:e km", "12:e månad", "72 månader", "2:a år", "1500 mil".
const QUANTITY =
  /(\d+(?:[.,]\d+)?)\s*(?::\s*[a-zåäö]+|[ae](?![a-zåäö]))?\s*(kilometer|km|mil|månader|månad|mån|år)(?![a-zåäö])/g;
const EVERY_WORD = /(^|[^a-zåäö])(var|varje|vart)(?![a-zåäö])/;
const FIRST_WORD = /(^|[^a-zåäö])(vid|efter|första|först|från)(?![a-zåäö])/;
const WORD_INTERVAL =
  /vart\s*(?:annat|andra|tredje|fjärde|femte|sjätte)\s+år|varannan\s+månad|(?:varje|vart)\s+år|årligen/i;
const THEN_WORD = /(^|[^a-zåäö])(?:och\s+)?(?:sedan|därefter|därpå)(?![a-zåäö])/;

type Quantity = { kind: "months" | "km"; value: number; mode: "every" | "first" | null };

function quantities(text: string): Quantity[] {
  const out: Quantity[] = [];
  let last = 0;
  let mode: Quantity["mode"] = null;
  for (const m of text.matchAll(QUANTITY)) {
    // Orden före talet avgör om det är ett intervall ("var") eller första gången ("vid").
    // Utan sådant ord gäller samma som för talet före, t.ex. "vid 105000 km eller 72 mån".
    const before = text.slice(last, m.index);
    if (EVERY_WORD.test(before)) mode = "every";
    else if (FIRST_WORD.test(before)) mode = "first";
    const n = Number(m[1]!.replace(",", "."));
    const unit = m[2]!;
    const kind = unit === "km" || unit === "kilometer" || unit === "mil" ? "km" : "months";
    const factor = unit === "mil" ? 10 : unit === "år" ? 12 : 1;
    if (n > 0) out.push({ kind, value: n * factor, mode });
    last = m.index! + m[0].length;
  }
  return out;
}

function parseServiceLine(line: string): Omit<ParsedService, "text"> {
  let t = line
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    // Tusental med mellanslag eller punkt: "105 000" och "15.000" blir 105000 och 15000.
    .replace(/(\d)[ .](?=\d{3}(?!\d))/g, "$1");
  t = t
    .replace(
      /(^|[^a-zåäö])vart\s*(annat|andra|tredje|fjärde|femte|sjätte)\s+år(?![a-zåäö])/g,
      (_, p: string, w: string) => `${p}var ${WORD_ORDINALS[w]} år`,
    )
    .replace(/(^|[^a-zåäö])varannan\s+månad(?![a-zåäö])/g, "$1var 2 månad")
    .replace(/(^|[^a-zåäö])(?:varje|vart)\s+år(?![a-zåäö])/g, "$1var 1 år")
    .replace(/(^|[^a-zåäö])årligen(?![a-zåäö])/g, "$1var 1 år");

  // "... och sedan var 15000:e km": det före är första gången, det efter är intervallet.
  const then = THEN_WORD.exec(t);
  const head = then ? t.slice(0, then.index + then[1]!.length) : t;
  const tail = then ? t.slice(then.index + then[0].length) : "";

  const parts: { months: Interval | null; km: Interval | null } = { months: null, km: null };
  for (const q of quantities(head)) {
    if (parts[q.kind]) continue;
    // Ett ensamt tal utan "vid" eller "var" räknas som intervall, precis som i eget intervall.
    const mode = q.mode ?? (then ? "first" : "every");
    parts[q.kind] = { first: q.value, every: mode === "every" ? q.value : null };
  }
  for (const q of quantities(tail)) {
    const p = parts[q.kind];
    if (p) p.every = q.value;
    // Bara efter "sedan", t.ex. "vid 36 månader … och sedan var 120000:e km": mätarställningen
    // vid första gången är okänd, så den delen räknas som var 120 000:e km från noll.
    else parts[q.kind] = { first: q.value, every: q.value };
  }

  const warning = !parts.months && !parts.km ? "Kunde inte tolkas – kontrollera manuellt." : null;
  return { ...parts, warning };
}

export function parseServiceText(input: string): ParsedService[] {
  const out: ParsedService[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const line = raw
      .replace(/^[\s*•·✓✔☐☑■□▪●○>–—-]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    // Rubriker och knappar som följt med i kopieringen har inga siffror och inget intervall
    // i ord ("vartannat år", "varje år").
    if (!/\d/.test(line) && !WORD_INTERVAL.test(line)) continue;
    // En tid på egen rad, t.ex. "(0,10 t)", hör till raden ovanför.
    const prev = out[out.length - 1];
    if (prev && /^\([^)]*\)$/.test(line)) {
      prev.text = `${prev.text} ${line}`;
      continue;
    }
    out.push({ text: line, ...parseServiceLine(line) });
  }
  return out;
}

export type PartEval = Interval & {
  // Null när åldern eller mätarställningen som behövs saknas.
  hits: number[] | null;
  done: number | null;
};

export type ServiceEval = {
  // Null när det inte går att avgöra (raden gick inte att tolka eller värden saknas).
  include: boolean | null;
  months: PartEval | null;
  km: PartEval | null;
  // Vid både månader och km: det som genomförts flest gånger och alltså gäller.
  basis: "months" | "km" | "equal" | null;
};

// Samma regler som för eget intervall: månader träffar under valt år, km inom ±10 000 km,
// och har raden båda gäller det som genomförts flest gånger. Vid lika många räcker det att
// något av dem träffar, eftersom det som kommer först gäller.
export function evaluateService(
  s: ParsedService,
  ctx: { year: number | null; km: number | null },
): ServiceEval {
  const months: PartEval | null = s.months && {
    ...s.months,
    hits:
      ctx.year === null
        ? null
        : occurrences(s.months.first, s.months.every, (ctx.year - 1) * 12, ctx.year * 12, false),
    done: ctx.year === null ? null : timesDone(s.months.first, s.months.every, ctx.year * 12),
  };
  const km: PartEval | null = s.km && {
    ...s.km,
    hits:
      ctx.km === null
        ? null
        : occurrences(
            s.km.first,
            s.km.every,
            Math.max(0, ctx.km - KM_STEP),
            ctx.km + KM_STEP,
            true,
          ),
    done: ctx.km === null ? null : timesDone(s.km.first, s.km.every, ctx.km),
  };
  const hit = (p: PartEval) => (p.hits?.length ?? 0) > 0;
  if ((!months && !km) || months?.hits === null || km?.hits === null) {
    return { include: null, months, km, basis: null };
  }
  if (months && km) {
    const basis = months.done === km.done ? "equal" : months.done! > km.done! ? "months" : "km";
    const include =
      basis === "months" ? hit(months) : basis === "km" ? hit(km) : hit(months) || hit(km);
    return { include, months, km, basis };
  }
  return { include: hit((months ?? km)!), months, km, basis: null };
}

// Senaste och nästa tillfälle runt `at`; null där det inte finns något.
export function intervalAround(
  first: number,
  every: number | null,
  at: number,
): { prev: number | null; next: number | null } {
  if (at < first) return { prev: null, next: first };
  if (every === null) return { prev: first, next: null };
  const prev = first + Math.floor((at - first) / every) * every;
  return { prev, next: prev + every };
}

// Uträkningen i klartext, rad för rad, så att man kan se varför något ska med eller inte.
export function describeService(
  s: ParsedService,
  e: ServiceEval,
  ctx: { year: number | null; km: number | null },
): string[] {
  if (!s.months && !s.km) return [s.warning ?? "Kunde inte tolkas – kontrollera manuellt."];
  const f = (n: number) => n.toLocaleString("sv-SE");
  const times = (n: number) => `Genomförd ${n} ${n === 1 ? "gång" : "gånger"} hittills.`;
  const lines: string[] = [];

  function part(p: PartEval, label: string, unit: string, at: number | null, where: string) {
    if (p.hits === null || at === null) {
      lines.push(`${label}: fyll i ${unit === "mån" ? "ålder" : "mätarställning"} överst.`);
      return;
    }
    if (p.hits.length > 0) {
      const list = p.hits
        .slice(0, 5)
        .map((h) => `${f(h)} ${unit} · ${ordinal(occurrenceFrom(p.first, p.every, h))}`)
        .join(", ");
      lines.push(`${label}: träffar ${where}: ${list}. ${times(p.done!)}`);
      return;
    }
    const { prev, next } = intervalAround(p.first, p.every, at);
    lines.push(
      `${label}: träffar inte ${where}.` +
        (next === null
          ? " Inga fler tillfällen."
          : ` Nästa: ${f(next)} ${unit} (om ${f(next - at)} ${unit}).`) +
        (prev === null ? "" : ` Senaste: ${f(prev)} ${unit} (för ${f(at - prev)} ${unit} sedan).`) +
        ` ${times(p.done!)}`,
    );
  }

  if (e.months) {
    const at = ctx.year === null ? null : ctx.year * 12;
    part(e.months, "Månader", "mån", at, `år ${ctx.year} (${at})`);
  }
  if (e.km) part(e.km, "Km", "km", ctx.km, "mätarställningen");
  if (e.basis === "equal") {
    lines.push(
      `Lika många gånger på år och km (${e.months!.done}). Tas med om något av dem träffar.`,
    );
  } else if (e.basis) {
    const [a, b] =
      e.basis === "months" ? [e.months!.done, e.km!.done] : [e.km!.done, e.months!.done];
    const name = e.basis === "months" ? "år" : "kilometer";
    lines.push(`Genomförd flest gånger: ${name} (${a} mot ${b}). Går på ${name}.`);
  }
  if (s.warning) lines.push(s.warning);
  return lines;
}

// ---- Mätarställning i fälten ----

// Mellanslag i stora tal så att de blir lättare att läsa: 90000 visas som "90 000" och
// 100000 som "100 000", medan 8000 får stå kvar. Annat än siffror lämnas orört.
export function formatKmInput(text: string): string {
  const digits = text.replace(/\s/g, "");
  if (!/^\d+$/.test(digits)) return text;
  return digits.length >= 5 ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : digits;
}

// Förslag medan man skriver mätarställningen: 90 blir 90 000 och 8 blir 8000. Bara för
// korta tal (1–3 siffror), annars null.
export function kmSuggestion(text: string): string | null {
  const digits = text.replace(/\s/g, "");
  return /^[1-9]\d{0,2}$/.test(digits) ? formatKmInput(`${digits}000`) : null;
}

// ---- Servicekoder Mercedes ----

export type MercedesCode = {
  service: string;
  // Koden i servicehäftet, t.ex. "D0D"; null där den saknas i listan.
  code: string | null;
  items: number[];
  note?: string;
};

export const MERCEDES_CODES: MercedesCode[] = [
  { service: "A", code: "505", items: [1, 3] },
  { service: "A1", code: "D0D", items: [1, 3, 4] },
  { service: "A2", code: null, items: [1, 3, 4, 8, 10, 12, 20, 25] },
  { service: "A3", code: "550A", items: [1, 3, 8, 11] },
  { service: "A4", code: "D50J", items: [1, 3, 8, 10, 11] },
  { service: "A5", code: null, items: [1, 3, 4, 8, 12] },
  { service: "A6", code: "DD0S", items: [1, 3, 4, 8, 10, 11] },
  { service: "A7", code: "G50M", items: [1, 3, 20] },
  { service: "A8", code: "Q50V", items: [1, 3, 10, 20] },
  { service: "A9", code: "GD0V", items: [1, 3, 4, 20] },
  { service: "A0", code: "850D", items: [1, 3, 10] },
  { service: "AC", code: "QD051", items: [1, 3, 4, 10, 20] },
  { service: "AF", code: "KD001", items: [1, 3, 4, 8, 12, 20] },
  { service: "AH", code: "801050E", items: [1, 3, 13, 24] },
  { service: "AG", code: "VD0A1", items: [1, 3, 4, 8, 10, 11, 20] },
  { service: "AK", code: "10D0E", items: [1, 3, 13] },
  { service: "AP", code: "15D0K", items: [1, 3, 4, 8, 11, 13] },
  { service: "B", code: "606", items: [2, 3] },
  { service: "B1", code: "E0E", items: [2, 3, 4] },
  { service: "B2", code: "8E0N", items: [2, 3, 4, 10] },
  { service: "B3", code: "560B", items: [2, 3, 8, 11] },
  { service: "B4", code: "B60H", items: [2, 3, 8, 10, 11] },
  { service: "B5", code: "5E0K", items: [2, 3, 4, 8, 11] },
  { service: "B5", code: "3E0H", items: [2, 3, 4, 8, 12] },
  { service: "B6", code: "DE0T", items: [2, 3, 4, 8, 10, 11] },
  { service: "B7", code: "G60N", items: [2, 3, 20] },
  { service: "B7", code: "GN061", items: [2, 3, 15, 20] },
  { service: "B8", code: "Q60W", items: [2, 3, 10, 20] },
  { service: "B9", code: "GE0W", items: [2, 3, 4, 20] },
  { service: "B0", code: "1607", items: [2, 3, 8] },
  { service: "B0", code: "960F", items: [2, 3, 8, 10], note: "På GL63" },
  { service: "BD", code: "M60T", items: [2, 3, 8, 11, 20] },
  { service: "BE", code: "V6031", items: [2, 3, 8, 10, 11, 20] },
  { service: "BF", code: null, items: [2, 3, 8, 11, 12] },
  { service: "BK", code: "10E0F", items: [2, 3, 4, 13] },
  { service: "BS", code: "1Q60X", items: [2, 3, 10, 13, 20] },
  { service: "BH", code: null, items: [2, 3, 13, 15] },
  { service: "BJ", code: null, items: [2, 3, 10, 13, 15] },
  { service: "BC", code: null, items: [2, 3, 4, 10, 15, 20] },
  // Som i listan, där 3 står två gånger.
  { service: "BT", code: null, items: [2, 3, 4, 3, 20, 11] },
];

// Stora bokstäver utan mellanslag och bindestreck. Bokstaven O räknas som noll, eftersom
// koderna bara har nollor (A0, D0D) och de är lätta att blanda ihop.
function normalizeCode(text: string): string {
  return text
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[\s–—-]/g, "");
}

// Sök på servicen (A1) eller koden (D0D). Utan exakt träff visas de som börjar likadant.
export function findMercedesCodes(query: string): {
  exact: MercedesCode[];
  similar: MercedesCode[];
} {
  const q = normalizeCode(query);
  if (!q) return { exact: [], similar: [] };
  const matches = (c: MercedesCode, f: (t: string) => boolean) =>
    f(normalizeCode(c.service)) || (c.code !== null && f(normalizeCode(c.code)));
  const exact = MERCEDES_CODES.filter((c) => matches(c, (t) => t === q));
  const similar = exact.length
    ? []
    : MERCEDES_CODES.filter((c) => matches(c, (t) => t.startsWith(q)));
  return { exact, similar };
}

// Kort sammanfattning per rad för rutan bredvid listan: bock eller kryss för km och år,
// och vid båda vilket som gäller.
export type ShortPart = {
  kind: "months" | "km";
  // Null när åldern eller mätarställningen saknas.
  hit: boolean | null;
  // Första träffen, t.ex. "150 000 km · 5:e".
  detail: string | null;
  done: number | null;
};

export function summarizeService(e: ServiceEval): { parts: ShortPart[]; choice: string | null } {
  const f = (n: number) => n.toLocaleString("sv-SE");
  const part = (p: PartEval, kind: ShortPart["kind"]): ShortPart => {
    const h = p.hits?.[0];
    return {
      kind,
      hit: p.hits === null ? null : p.hits.length > 0,
      detail:
        h === undefined
          ? null
          : `${f(h)} ${kind === "km" ? "km" : "mån"} · ${ordinal(occurrenceFrom(p.first, p.every, h))}`,
      done: p.done,
    };
  };
  const parts: ShortPart[] = [];
  if (e.months) parts.push(part(e.months, "months"));
  if (e.km) parts.push(part(e.km, "km"));
  const times = (n: number) => `${n} ${n === 1 ? "gång" : "gånger"}`;
  let choice: string | null = null;
  if (e.basis === "equal") {
    choice = `Lika många gånger (${times(e.months!.done!)}), det räcker att en träffar`;
  } else if (e.basis === "months") {
    choice = `Gå på år: genomförd ${times(e.months!.done!)} mot km ${times(e.km!.done!)}`;
  } else if (e.basis === "km") {
    choice = `Gå på km: genomförd ${times(e.km!.done!)} mot år ${times(e.months!.done!)}`;
  }
  return { parts, choice };
}
