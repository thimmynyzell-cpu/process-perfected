import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EXTRA_SERVICES,
  KM_INTERVALS,
  ageRule,
  isHalfYear,
  kmRule,
  manualBasis,
  manualHits,
  normalizeInterval,
  monthsToYear,
  occurrenceFrom,
  occurrenceNumber,
  ordinal,
  ruleHits,
  surroundingOccurrences,
  timesDone,
  yearChoices,
  type Rule,
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
};

const blankManual = (id: number): ManualText => ({
  id,
  monthFirst: "",
  monthEvery: "",
  kmFirst: "",
  kmEvery: "",
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

function ServicePage() {
  const [months, setMonths] = useState("");
  const [yearText, setYearText] = useState("");
  const [pick, setPick] = useState<number | null>(null);
  const [km, setKm] = useState("");
  const [manuals, setManuals] = useState<ManualText[]>([blankManual(1)]);
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

  // Bara rader som träffar visas.
  function matching(rows: Row[]) {
    return rows
      .map((row) => ({ row, hits: ruleHits(row.rule, ctx) ?? [] }))
      .filter((r) => r.hits.length > 0);
  }

  function renderRows(rows: Row[]) {
    return (
      <ul className="mt-3 space-y-2">
        {matching(rows).map(({ row, hits }) => (
          <li key={row.key} className="flex flex-wrap items-center gap-x-2 font-medium">
            <Tick on />
            <span className="whitespace-nowrap">{row.label}</span>
            <span className="text-sm font-normal text-muted-foreground">
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

  function manualResult(m: ManualText) {
    const monthFirst = parse(m.monthFirst);
    const monthEvery = parse(m.monthEvery);
    const kmFirst = parse(m.kmFirst);
    const kmEvery = parse(m.kmEvery);
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
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Wrench className="size-5" /> Serviceschema
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Skriv in ålder och mätarställning så visas tilläggsservicarna som träffar.
        </p>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <section className="space-y-4 rounded-lg border p-4">
            <h2 className="font-semibold">Ålder</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="months">Antal månader</Label>
                <Input
                  id="months"
                  placeholder="120"
                  className="h-8 max-w-32 px-2 text-sm placeholder:text-muted-foreground/40"
                  inputMode="numeric"
                  autoFocus
                  value={months}
                  onChange={(e) => changeMonths(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">eller år</Label>
                <Input
                  id="year"
                  placeholder="10"
                  className="h-8 max-w-32 px-2 text-sm placeholder:text-muted-foreground/40"
                  inputMode="decimal"
                  value={yearText}
                  onChange={(e) => changeYear(e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border p-4">
            <h2 className="font-semibold">Mätarställning</h2>
            <div className="space-y-2">
              <Label htmlFor="km">Kilometer</Label>
              <Input
                id="km"
                placeholder="90000"
                className="h-8 max-w-32 px-2 text-sm placeholder:text-muted-foreground/40"
                inputMode="numeric"
                value={km}
                onChange={(e) => setKm(e.target.value)}
              />
            </div>
          </section>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="destructive"
            size="lg"
            onClick={clearAll}
            className="w-1/4 min-w-28"
          >
            Rensa
          </Button>
        </div>

        <div className="mt-6 grid items-start gap-6 sm:grid-cols-2">
          <div>
            {year !== null && value !== null && (
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">
                  {value} månader ={" "}
                  <span className="font-semibold text-foreground">
                    {(value / 12).toLocaleString("sv-SE", { maximumFractionDigits: 2 })} år
                  </span>
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
                              ? "rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                              : "rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                          }
                        >
                          År {c} ({c * 12})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-3 text-sm text-muted-foreground">
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
            )}
          </div>
          <div>
            {kmValue !== null && (
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">
                  Intervall mellan {fmt(Math.max(0, kmValue - 10_000))} och {fmt(kmValue + 10_000)}{" "}
                  km
                </p>
                <p className="mt-2 text-sm font-bold">
                  Endast intervall på 10 000 km tas med (10 000, 20 000, 30 000 …).
                </p>
                {matching(KM_ROWS).length === 0 && (
                  <p className="mt-2 font-medium">Inga körsträcksintervall träffar.</p>
                )}
                {renderRows(KM_ROWS)}
              </div>
            )}
          </div>
        </div>

        <section className="mt-8 space-y-4">
          <h2 className="font-semibold">Eget intervall</h2>
          <p className="text-sm text-muted-foreground">
            Skriv in första gången och därefter varje. Fyller du bara i ett av fälten gäller det som
            intervall, så 48 betyder var 48:e månad. Fyll i månader, kilometer eller båda på samma
            intervall.
          </p>
          {manuals.map((m, i) => {
            const result = manualResult(m);
            return (
              <div key={m.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Eget intervall {i + 1}</h3>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setManuals(manuals.map((x) => (x.id === m.id ? blankManual(m.id) : x)))
                      }
                      className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
                    >
                      Rensa
                    </button>
                    {manuals.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Ta bort eget intervall ${i + 1}`}
                        onClick={() => setManuals(manuals.filter((x) => x.id !== m.id))}
                        className="rounded p-1 text-muted-foreground hover:bg-accent"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor={`mf${m.id}`} className="text-xs">
                        Första gången (mån)
                      </Label>
                      <Input
                        id={`mf${m.id}`}
                        placeholder="120"
                        className="h-8 max-w-32 px-2 text-sm placeholder:text-muted-foreground/40"
                        inputMode="numeric"
                        value={m.monthFirst}
                        onChange={(e) => changeManual(m.id, "monthFirst", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`me${m.id}`} className="text-xs">
                        Därefter varje (mån)
                      </Label>
                      <Input
                        id={`me${m.id}`}
                        placeholder="60"
                        className="h-8 max-w-32 px-2 text-sm placeholder:text-muted-foreground/40"
                        inputMode="numeric"
                        value={m.monthEvery}
                        onChange={(e) => changeManual(m.id, "monthEvery", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor={`kf${m.id}`} className="text-xs">
                        Första gången (km)
                      </Label>
                      <Input
                        id={`kf${m.id}`}
                        placeholder="35000"
                        className="h-8 max-w-32 px-2 text-sm placeholder:text-muted-foreground/40"
                        inputMode="numeric"
                        value={m.kmFirst}
                        onChange={(e) => changeManual(m.id, "kmFirst", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`ke${m.id}`} className="text-xs">
                        Därefter varje (km)
                      </Label>
                      <Input
                        id={`ke${m.id}`}
                        placeholder="120000"
                        className="h-8 max-w-32 px-2 text-sm placeholder:text-muted-foreground/40"
                        inputMode="numeric"
                        value={m.kmEvery}
                        onChange={(e) => changeManual(m.id, "kmEvery", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                {result && (
                  <div
                    className={
                      result.on
                        ? "mt-3 flex items-start gap-2 font-medium"
                        : "mt-3 flex items-start gap-2 text-muted-foreground"
                    }
                  >
                    <Tick on={result.on} />
                    <div className="space-y-0.5 text-sm">
                      {result.lines.map((l) => (
                        <p key={l}>{l}</p>
                      ))}
                    </div>
                  </div>
                )}
                {result?.basis && (
                  <p className="mt-3 rounded-md border bg-muted/40 p-3 text-sm font-medium">
                    Genomförd flest gånger:{" "}
                    {result.basis.choice === "equal"
                      ? `lika många (${result.basis.months} gånger på år och km). Välj själv.`
                      : `${result.basis.choice === "months" ? "år" : "kilometer"} (${
                          result.basis.choice === "months" ? result.basis.months : result.basis.km
                        } mot ${
                          result.basis.choice === "months" ? result.basis.km : result.basis.months
                        } gånger). Gå på ${result.basis.choice === "months" ? "år" : "kilometer"}.`}
                  </p>
                )}
              </div>
            );
          })}
          <Button type="button" variant="outline" onClick={addManual}>
            <Plus className="size-4" /> Lägg till eget intervall
          </Button>
        </section>
      </main>
    </div>
  );
}
