import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Megaphone, Plus, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EXTRA_SERVICES,
  KM_INTERVALS,
  ageRule,
  describeService,
  evaluateService,
  isHalfYear,
  formatAge,
  kmRule,
  manualBasis,
  manualHits,
  normalizeInterval,
  monthsToYear,
  occurrenceFrom,
  occurrenceNumber,
  ordinal,
  parseServiceText,
  ruleHits,
  surroundingOccurrences,
  timesDone,
  yearChoices,
  type ParsedService,
  type Rule,
  type ServiceEval,
} from "@/lib/serviceSchedule";

export const Route = createFileRoute("/service")({
  head: () => ({
    meta: [
      { title: "Serviceschema — tilläggsservicar" },
      {
        name: "description",
        content: "Skriv in ålder och mätarställning och se vilka tilläggsservicar som ska med.",
      },
    ],
  }),
  component: ServicePage,
});

const fmt = (n: number) => n.toLocaleString("sv-SE");

// Punkt som tusentalsavgränsare räknas med (35.000 = 35000), utom i årsfältet där 3.5 är ett
// decimaltal.
function parse(text: string, dotThousands = true): number | null {
  const t = text.replace(/\s/g, "");
  const n = Number(
    dotThousands && /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t.replace(",", "."),
  );
  return text.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}

// Längsta intervallen som de vanliga listorna räknar med.
const MAX_AGE_EVERY = Math.max(...EXTRA_SERVICES.map((e) => e.everyYears)) * 12;
const MAX_KM_EVERY = Math.max(...KM_INTERVALS);

type Row = { key: string; label: string; rule: Rule };

const AGE_ROWS: Row[] = EXTRA_SERVICES.map((s) => ({
  key: `age:${s.label}`,
  label: s.label,
  rule: ageRule(s),
}));

const KM_ROWS: Row[] = KM_INTERVALS.map((n) => ({
  key: `km:${n}`,
  label: `Var ${fmt(n)} km`,
  rule: kmRule(n),
}));

// Ett eget intervall, som text så att fälten går att skriva i.
type ManualText = {
  id: number;
  monthFirst: string;
  monthEvery: string;
  kmFirst: string;
  kmEvery: string;
  // Rad 1: bara "varje" i månader eller km.
  simpleMonthEvery: string;
  simpleKmEvery: string;
};

const blankManual = (id: number): ManualText => ({
  id,
  monthFirst: "",
  monthEvery: "",
  kmFirst: "",
  kmEvery: "",
  simpleMonthEvery: "",
  simpleKmEvery: "",
});

function Tick({ on }: { on: boolean }) {
  return (
    <span
      className={
        on
          ? "flex size-5 shrink-0 items-center justify-center rounded bg-primary text-xs text-primary-foreground"
          : "size-5 shrink-0 rounded border"
      }
    >
      {on ? "✓" : ""}
    </span>
  );
}

function NumField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (text: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[0.8rem] text-foreground">
        {label}
      </Label>
      <Input
        id={id}
        placeholder={placeholder}
        className="h-9 max-w-32 rounded-full border-[1.5px] border-foreground/25 bg-background px-3.5 text-sm font-medium placeholder:text-muted-foreground/60 hover:border-foreground/40"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

type ManualResult = {
  on: boolean;
  lines: string[];
  basis: ReturnType<typeof manualBasis>;
} | null;

function ManualResultView({ result }: { result: ManualResult }) {
  if (!result) return null;
  const { basis } = result;
  return (
    <>
      <div
        className={
          result.on
            ? "mt-3 flex items-start gap-2 font-medium"
            : "mt-3 flex items-start gap-2 text-foreground/75"
        }
      >
        <Tick on={result.on} />
        <div className="space-y-0.5 text-sm">
          {result.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </div>
      {basis && (
        <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold">
          Genomförd flest gånger:{" "}
          {basis.choice === "equal"
            ? `lika många (${basis.months} gånger på år och km). Välj själv.`
            : `${basis.choice === "months" ? "år" : "kilometer"} (${
                basis.choice === "months" ? basis.months : basis.km
              } mot ${basis.choice === "months" ? basis.km : basis.months} gånger). Gå på ${
                basis.choice === "months" ? "år" : "kilometer"
              }.`}
        </p>
      )}
    </>
  );
}

// Listan ser ut som tilläggsservicen på bokningssidan, så att det är lätt att klicka i samma
// rutor där. Därför har den egna färger och typsnitt i stället för sidans tema.
function ServicePanel({ items }: { items: { s: ParsedService; e: ServiceEval }[] }) {
  return (
    <div
      className="max-w-[340px] rounded-[4px] border border-[#e3e3e3] bg-white px-6 pb-6 pt-5 text-[#1b1b1b] shadow-sm"
      style={{ fontFamily: "Roboto, Arial, sans-serif" }}
    >
      <h3
        className="mb-3.5 text-lg font-bold text-[#111]"
        style={{ fontFamily: '"Roboto Slab", Georgia, serif' }}
      >
        TILLÄGGSSERVICE
      </h3>
      <p className="mb-5 font-bold text-[#111]">Välj eventuell tilläggsservice</p>
      <ul className="space-y-[18px] pl-1">
        {items.map(({ s, e }, i) => {
          const time = /^(.*?)\s*(\([^)]*\))\s*$/.exec(s.text);
          return (
            <li key={i} className="flex items-start gap-2.5 text-[15px] leading-tight">
              {e.include ? (
                <span
                  role="img"
                  aria-label="Ska med"
                  className="mt-0.5 grid size-[15px] shrink-0 place-items-center rounded-[1px] bg-[#ffe500] outline outline-1 outline-[#b8a400]"
                >
                  <Check className="size-3 text-black" strokeWidth={3.5} />
                </span>
              ) : (
                <span
                  role="img"
                  aria-label={e.include === null ? "Går inte att avgöra" : "Ska inte med"}
                  className="mt-0.5 size-[15px] shrink-0 rounded-[1px] bg-[#7b7b7b]"
                />
              )}
              <span className="max-w-[230px]">
                {time ? time[1] : s.text}
                {time && (
                  <>
                    <br />
                    {"\u00a0"}
                    {time[2]}
                  </>
                )}
                {!s.months && !s.km && (
                  <span className="mt-1 block text-xs text-[#b25b00]">
                    Kunde inte tolkas – kontrollera manuellt
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ServicePage() {
  const [months, setMonths] = useState("");
  const [yearText, setYearText] = useState("");
  const [pick, setPick] = useState<number | null>(null);
  const [km, setKm] = useState("");
  const [manuals, setManuals] = useState<ManualText[]>([blankManual(1)]);
  const [serviceText, setServiceText] = useState("");
  const [nextId, setNextId] = useState(2);

  // Månader och år hänger ihop: ändrar man det ena uppdateras det andra.
  function changeMonths(text: string) {
    const m = parse(text);
    setMonths(text);
    setYearText(m === null ? "" : String(monthsToYear(m)));
    setPick(null);
  }
  function changeYear(text: string) {
    const y = parse(text, false);
    setYearText(text);
    setMonths(y === null ? "" : String(Math.round(y * 12)));
    setPick(null);
  }
  function changeManual(id: number, field: keyof Omit<ManualText, "id">, text: string) {
    setManuals(manuals.map((m) => (m.id === id ? { ...m, [field]: text } : m)));
  }
  function clearAll() {
    setMonths("");
    setYearText("");
    setPick(null);
    setKm("");
    setManuals([blankManual(nextId)]);
    setNextId(nextId + 1);
    setServiceText("");
  }
  function addManual() {
    setManuals([...manuals, blankManual(nextId)]);
    setNextId(nextId + 1);
  }

  const value = parse(months);
  const choices = value === null ? [] : yearChoices(value);
  const year =
    value === null ? null : pick !== null && choices.includes(pick) ? pick : monthsToYear(value);
  const kmValue = parse(km);
  const ctx = { year, km: kmValue };
  const services = parseServiceText(serviceText).map((s) => ({ s, e: evaluateService(s, ctx) }));

  // Bara rader som träffar visas.
  function matching(rows: Row[]) {
    return rows
      .map((row) => ({ row, hits: ruleHits(row.rule, ctx) ?? [] }))
      .filter((r) => r.hits.length > 0);
  }

  function renderRows(rows: Row[]) {
    return (
      <ul className="mt-2 space-y-1">
        {matching(rows).map(({ row, hits }) => (
          <li key={row.key} className="flex flex-wrap items-center gap-x-2 font-medium">
            <Tick on />
            <span className="whitespace-nowrap font-semibold text-primary">{row.label}</span>
            <span className="text-sm font-normal text-foreground/75">
              (
              {hits
                .slice(0, 5)
                .map((h) =>
                  row.rule.unit === "km"
                    ? `${fmt(h)} · ${ordinal(occurrenceNumber(row.rule, h))}`
                    : ordinal(occurrenceNumber(row.rule, h)),
                )
                .join(", ")}
              {hits.length > 5 ? ` … +${hits.length - 5}` : ""})
            </span>
          </li>
        ))}
      </ul>
    );
  }

  // När intervallet inte träffar: hur långt det är till nästa tillfälle och sedan senaste.
  function distance(first: number, every: number, at: number, unit: "mån" | "km") {
    const { prev, next } = surroundingOccurrences(first, every, at);
    const f = (n: number) => (unit === "km" ? fmt(n) : String(n));
    return ` Nästa: ${f(next)} ${unit} (om ${f(next - at)} ${unit}).${
      prev === null ? "" : ` Senaste: ${f(prev)} ${unit} (för ${f(at - prev)} ${unit} sedan).`
    }`;
  }

  function manualResult(
    monthFirst: number | null,
    monthEvery: number | null,
    kmFirst: number | null,
    kmEvery: number | null,
  ) {
    const usesMonths = normalizeInterval(monthFirst, monthEvery) !== null;
    const usesKm = normalizeInterval(kmFirst, kmEvery) !== null;
    if (!usesMonths && !usesKm) return null;

    const mYear = year;
    const mKm = kmValue;
    const mctx = { year: mYear, km: mKm };

    const hits = manualHits({ monthFirst, monthEvery, kmFirst, kmEvery }, mctx);
    const times = (n: number) => `Genomförd ${n} ${n === 1 ? "gång" : "gånger"} hittills.`;
    const lines: string[] = [];
    if (usesMonths) {
      const { first, every } = normalizeInterval(monthFirst, monthEvery)!;
      lines.push(
        hits.months === null
          ? "Ange ålder för att räkna på månader."
          : `${
              hits.months.length === 0
                ? `Träffar inte år ${mYear} (${mYear! * 12}).${distance(first, every, mYear! * 12, "mån")}`
                : `Träffar år ${mYear} (${mYear! * 12}): ${hits.months
                    .slice(0, 5)
                    .map((h) => `${h} mån · ${ordinal(occurrenceFrom(first, every, h))}`)
                    .join(", ")}.`
            } ${times(timesDone(first, every, mYear! * 12))}`,
      );
    }
    if (usesKm) {
      const { first, every } = normalizeInterval(kmFirst, kmEvery)!;
      lines.push(
        hits.km === null
          ? "Ange mätarställning för att räkna på kilometer."
          : `${
              hits.km.length === 0
                ? `Träffar inte mätarställningen.${distance(first, every, mKm!, "km")}`
                : `Träffar mätarställningen: ${hits.km
                    .slice(0, 5)
                    .map((h) => `${fmt(h)} km · ${ordinal(occurrenceFrom(first, every, h))}`)
                    .join(", ")}.`
            } ${times(timesDone(first, every, mKm!))}`,
      );
    }
    const on = (hits.months?.length ?? 0) > 0 || (hits.km?.length ?? 0) > 0;
    const basis =
      usesMonths && usesKm ? manualBasis({ monthFirst, monthEvery, kmFirst, kmEvery }, mctx) : null;
    return { on, lines, basis };
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-6 text-sm">
        <section className="rounded-3xl bg-gradient-to-b from-primary/15 to-primary/[0.03] px-4 pb-5 pt-8 text-center">
          <h1 className="flex items-center justify-center gap-2 text-3xl font-bold tracking-tight text-primary">
            <Wrench className="size-6" /> Serviceschema
          </h1>
          <p className="mx-auto mt-1.5 max-w-prose text-foreground/75">
            Skriv in ålder och mätarställning så visas tilläggsservicarna som träffar.
          </p>
          <div className="mx-auto mt-5 grid w-full max-w-2xl gap-2.5">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-2xl bg-card px-4 py-3 text-left shadow-sm">
              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-foreground/90">
                  Ålder
                </p>
                <div className="flex gap-2.5">
                  <div className="space-y-1">
                    <Label htmlFor="months">Antal månader</Label>
                    <Input
                      id="months"
                      placeholder="120"
                      className="h-9 max-w-32 rounded-full border-[1.5px] border-foreground/25 bg-background px-3.5 text-sm font-medium placeholder:text-muted-foreground/60 hover:border-foreground/40"
                      inputMode="numeric"
                      autoFocus
                      value={months}
                      onChange={(e) => changeMonths(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="year">eller år</Label>
                    <Input
                      id="year"
                      placeholder="10"
                      className="h-9 max-w-32 rounded-full border-[1.5px] border-foreground/25 bg-background px-3.5 text-sm font-medium placeholder:text-muted-foreground/60 hover:border-foreground/40"
                      inputMode="decimal"
                      value={yearText}
                      onChange={(e) => changeYear(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="hidden self-stretch border-l sm:block" aria-hidden="true" />
              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-foreground/90">
                  Mätarställning
                </p>
                <div className="space-y-1">
                  <Label htmlFor="km">Kilometer</Label>
                  <Input
                    id="km"
                    placeholder="90000"
                    className="h-9 max-w-32 rounded-full border-[1.5px] border-foreground/25 bg-background px-3.5 text-sm font-medium placeholder:text-muted-foreground/60 hover:border-foreground/40"
                    inputMode="numeric"
                    value={km}
                    onChange={(e) => setKm(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="destructive"
              onClick={clearAll}
              className="w-1/4 min-w-28 justify-self-end rounded-full shadow-sm"
            >
              Rensa
            </Button>
          </div>
        </section>

        {(months.trim() !== "" || yearText.trim() !== "" || km.trim() !== "") && (
          <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-l-4 border-amber-500/70 bg-amber-500/10 px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none">
            <Megaphone className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>
              <strong>OBS!</strong> De vanliga intervallen räknar som längst var {MAX_AGE_EVERY}:e
              månad och var {fmt(MAX_KM_EVERY)} km. För intervall utöver varje {MAX_AGE_EVERY}:e
              månad eller utöver varje {fmt(MAX_KM_EVERY)} km, räkna manuellt under Eget intervall.
            </span>
          </p>
        )}

        <div className="mt-4 grid items-start gap-6 sm:grid-cols-2">
          <div>
            {year !== null && value !== null && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-foreground/90">
                  Tilläggsservicar
                </p>
                <div className="rounded-2xl border bg-card px-4 py-3.5 shadow-sm">
                  <p className="text-sm text-foreground/75">
                    {value} månader
                    {value >= 12 && (
                      <>
                        {" "}
                        = <span className="font-semibold text-foreground">{formatAge(value)}</span>
                      </>
                    )}
                  </p>
                  {choices.length > 1 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium">
                        {isHalfYear(value)
                          ? `Mitt emellan år ${choices[0]} (${choices[0]! * 12}) och år ${choices[1]} (${choices[1]! * 12}). Välj år:`
                          : "Välj år:"}
                      </p>
                      <div className="flex gap-2">
                        {choices.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-pressed={c === year}
                            onClick={() => setPick(c)}
                            className={
                              c === year
                                ? "rounded-full border border-primary bg-primary px-3.5 py-1 text-sm font-semibold text-primary-foreground"
                                : "rounded-full border bg-card px-3.5 py-1 text-sm font-medium hover:bg-accent"
                            }
                          >
                            År {c} ({c * 12})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="mt-3 text-sm text-foreground/75">
                    Tilläggsservicar för{" "}
                    <span className="font-semibold text-foreground">
                      år {year} ({year * 12})
                    </span>
                  </p>
                  {matching(AGE_ROWS).length === 0 && (
                    <p className="mt-2 font-medium">Inga tilläggsservicar detta år.</p>
                  )}
                  {renderRows(AGE_ROWS)}
                </div>
              </div>
            )}
          </div>
          <div>
            {kmValue !== null && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-foreground/90">
                  Kilometerintervall
                </p>
                <div className="rounded-2xl border bg-card px-4 py-3.5 shadow-sm">
                  <p className="text-sm text-foreground/75">
                    Intervall mellan {fmt(Math.max(0, kmValue - 10_000))} och{" "}
                    {fmt(kmValue + 10_000)} km
                  </p>
                  <p className="mt-2 text-sm font-bold">
                    Endast intervall på 10 000 km tas med (10 000, 20 000, 30 000 …).
                  </p>
                  {matching(KM_ROWS).length === 0 && (
                    <p className="mt-2 font-medium">Inga körsträcksintervall träffar.</p>
                  )}
                  {renderRows(KM_ROWS)}
                </div>
              </div>
            )}
          </div>
        </div>

        <section className="mt-6 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-foreground/90">
            Eget intervall
          </h2>
          {manuals.map((m, i) => {
            return (
              <div key={m.id} className="rounded-2xl border bg-card px-4 py-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-primary">Eget intervall {i + 1}</h3>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setManuals(manuals.map((x) => (x.id === m.id ? blankManual(m.id) : x)))
                      }
                      className="rounded px-2 py-1 text-sm text-foreground/75 hover:bg-accent"
                    >
                      Rensa
                    </button>
                    {manuals.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Ta bort eget intervall ${i + 1}`}
                        onClick={() => setManuals(manuals.filter((x) => x.id !== m.id))}
                        className="rounded p-1 text-foreground/75 hover:bg-accent"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <p className="text-base font-semibold text-foreground">
                      Rad 1 · Bara intervall (varje)
                    </p>
                    <p className="mt-0.5 text-sm text-foreground/75">
                      Räknar bara ett intervall, varje X månader eller km.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-7 gap-y-2">
                      <NumField
                        id={`sm${m.id}`}
                        label="Varje (mån)"
                        placeholder="12"
                        value={m.simpleMonthEvery}
                        onChange={(t) => changeManual(m.id, "simpleMonthEvery", t)}
                      />
                      <NumField
                        id={`sk${m.id}`}
                        label="Varje (km)"
                        placeholder="15000"
                        value={m.simpleKmEvery}
                        onChange={(t) => changeManual(m.id, "simpleKmEvery", t)}
                      />
                    </div>
                    <ManualResultView
                      result={manualResult(
                        null,
                        parse(m.simpleMonthEvery),
                        null,
                        parse(m.simpleKmEvery),
                      )}
                    />
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <p className="text-base font-semibold text-foreground">
                      Rad 2 · Första gången och därefter
                    </p>
                    <p className="mt-0.5 text-sm text-foreground/75">
                      Räknar första gången och därefter. Fyller du bara i ett av fälten gäller det
                      som intervall, så 48 betyder var 48:e månad.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-7 gap-y-2">
                      <div className="grid grid-cols-2 gap-3">
                        <NumField
                          id={`mf${m.id}`}
                          label="Första gången (mån)"
                          placeholder="120"
                          value={m.monthFirst}
                          onChange={(t) => changeManual(m.id, "monthFirst", t)}
                        />
                        <NumField
                          id={`me${m.id}`}
                          label="Därefter varje (mån)"
                          placeholder="60"
                          value={m.monthEvery}
                          onChange={(t) => changeManual(m.id, "monthEvery", t)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <NumField
                          id={`kf${m.id}`}
                          label="Första gången (km)"
                          placeholder="35000"
                          value={m.kmFirst}
                          onChange={(t) => changeManual(m.id, "kmFirst", t)}
                        />
                        <NumField
                          id={`ke${m.id}`}
                          label="Därefter varje (km)"
                          placeholder="120000"
                          value={m.kmEvery}
                          onChange={(t) => changeManual(m.id, "kmEvery", t)}
                        />
                      </div>
                    </div>
                    <ManualResultView
                      result={manualResult(
                        parse(m.monthFirst),
                        parse(m.monthEvery),
                        parse(m.kmFirst),
                        parse(m.kmEvery),
                      )}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            onClick={addManual}
            className="rounded-full border-dashed border-primary text-primary hover:bg-primary/10"
          >
            <Plus className="size-4" /> Lägg till eget intervall
          </Button>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-foreground/90">
            Klistra in tilläggsservice
          </h2>
          <p className="text-sm text-foreground/75">
            Klistra in tilläggsservicen från bokningssidan, en per rad. Sidan räknar ut vilka som
            ska med utifrån ålder och mätarställning överst, med samma regler som eget intervall.
            Tiden inom parentes, till exempel (0,10 t), räknas inte.
          </p>
          <div className="rounded-2xl border bg-card px-4 py-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <Label htmlFor="serviceText" className="text-base font-semibold">
                Fritext
              </Label>
              <button
                type="button"
                onClick={() => setServiceText("")}
                className="rounded px-2 py-1 text-sm text-foreground/75 hover:bg-accent"
              >
                Rensa
              </button>
            </div>
            <Textarea
              id="serviceText"
              rows={6}
              value={serviceText}
              onChange={(e) => setServiceText(e.target.value)}
              placeholder={
                "Var 30000:e km oberoende av månader (0,10 t)\nVid 105000 km eller 72 månader och sedan var 15000:e km eller 12:e månad (0,10 t)"
              }
              className="mt-2 rounded-xl border-[1.5px] border-foreground/25 bg-background text-sm placeholder:text-muted-foreground/60"
            />
          </div>
          {services.length > 0 && (
            <>
              {services.some(({ s, e }) => e.include === null && (s.months || s.km)) && (
                <p className="text-sm font-medium text-amber-700">
                  Fyll i ålder och mätarställning överst så räknas listan ut.
                </p>
              )}
              <ServicePanel items={services} />
              <details className="rounded-2xl border bg-card shadow-sm">
                <summary className="cursor-pointer px-4 py-3 font-semibold">
                  Visa uträkning ({services.filter(({ e }) => e.include).length} av{" "}
                  {services.length} ska med
                  {services.some(({ e }) => e.include === null)
                    ? `, ${services.filter(({ e }) => e.include === null).length} går inte att avgöra`
                    : ""}
                  )
                </summary>
                <div className="space-y-3 border-t px-4 py-3 text-sm">
                  {services.map(({ s, e }, i) => (
                    <div key={i} className="space-y-0.5">
                      <p className="font-semibold">{s.text}</p>
                      {describeService(s, e, ctx).map((l) => (
                        <p key={l} className="text-foreground/80">
                          {l}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
