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
  monthsToYear,
  occurrenceFrom,
  occurrenceNumber,
  ordinal,
  ruleHits,
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
  // Mätarställning för just det här intervallet. Tomt = värdet ovan. Åldern utgår alltid från
  // fältet överst.
  vKm: string;
};

const blankManual = (id: number): ManualText => ({
  id,
  monthFirst: "",
  monthEvery: "",
  kmFirst: "",
  kmEvery: "",
  vKm: "",
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

  function manualResult(m: ManualText) {
    const monthFirst = parse(m.monthFirst);
    const monthEvery = parse(m.monthEvery);
    const kmFirst = parse(m.kmFirst);
    const kmEvery = parse(m.kmEvery);
    const usesMonths = monthFirst !== null || monthEvery !== null;
    const usesKm = kmFirst !== null || kmEvery !== null;
    if (!usesMonths && !usesKm) return null;

    const mYear = year;
    const mKm = parse(m.vKm) ?? kmValue;
    const mctx = { year: mYear, km: mKm };

    const hits = manualHits({ monthFirst, monthEvery, kmFirst, kmEvery }, mctx);
    const times = (n: number) => `Genomförd ${n} ${n === 1 ? "gång" : "gånger"} hittills.`;
    const lines: string[] = [];
    if (usesMonths) {
      const first = monthFirst ?? monthEvery!;
      const every = monthEvery !== null && monthEvery > 0 ? monthEvery : null;
      lines.push(
        hits.months === null
          ? "Ange ålder för att räkna på månader."
          : `${
              hits.months.length === 0
                ? `Träffar inte år ${mYear}.`
                : `Träffar år ${mYear}: ${hits.months
                    .slice(0, 5)
                    .map((h) => `${h} mån · ${ordinal(occurrenceFrom(first, every, h))}`)
                    .join(", ")}.`
            } ${times(timesDone(first, every, mYear! * 12))}`,
      );
    }
    if (usesKm) {
      const first = kmFirst ?? kmEvery!;
      const every = kmEvery !== null && kmEvery > 0 ? kmEvery : null;
      lines.push(
        hits.km === null
          ? "Ange mätarställning för att räkna på kilometer."
          : `${
              hits.km.length === 0
                ? "Träffar inte mätarställningen."
                : `Träffar mätarställningen: ${hits.km
                    .slice(0, 5)
                    .map((h) => `${fmt(h)} km · ${ordinal(occurrenceFrom(first, every, h))}`)
                    .join(", ")}.`
            } ${times(timesDone(first, every, mKm! + 10_000))}`,
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
          <section className="space-y-4">
            <h2 className="font-semibold">Ålder</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="months">Antal månader</Label>
                <Input
                  id="months"
                  inputMode="numeric"
                  autoFocus
                  placeholder="t.ex. 144"
                  value={months}
                  onChange={(e) => changeMonths(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">eller år</Label>
                <Input
                  id="year"
                  inputMode="decimal"
                  placeholder="t.ex. 12"
                  value={yearText}
                  onChange={(e) => changeYear(e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold">Mätarställning</h2>
            <div className="space-y-2">
              <Label htmlFor="km">Kilometer</Label>
              <Input
                id="km"
                inputMode="numeric"
                placeholder="t.ex. 60000"
                value={km}
                onChange={(e) => setKm(e.target.value)}
              />
            </div>
          </section>
        </div>

        <Button
          type="button"
          variant="destructive"
          size="lg"
          onClick={clearAll}
          className="mt-6 w-full"
        >
          Rensa allt
        </Button>

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
                        ? `Mitt emellan år ${choices[0]} och år ${choices[1]}. Välj år:`
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
                          År {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-3 text-sm text-muted-foreground">
                  Tilläggsservicar för{" "}
                  <span className="font-semibold text-foreground">år {year}</span>
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
            Skriv in första gången och därefter varje. Fyll i månader, kilometer eller båda på samma
            intervall. Lämnar du &quot;därefter varje&quot; tomt räknas bara första gången.
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
                        inputMode="numeric"
                        placeholder="120"
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
                        inputMode="numeric"
                        placeholder="60"
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
                        inputMode="numeric"
                        placeholder="35000"
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
                        inputMode="numeric"
                        placeholder="120000"
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
