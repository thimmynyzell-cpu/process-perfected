import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EXTRA_SERVICES,
  KM_INTERVALS,
  ageRule,
  isHalfYear,
  kmRule,
  occurrenceNumber,
  ordinal,
  monthsToYear,
  ruleHits,
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

function parse(text: string): number | null {
  const n = Number(text.replace(/\s/g, "").replace(",", "."));
  return text.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}

// Regeln som text, så att fälten går att skriva i.
type RuleText = { first: string; every: string; unit: "months" | "km" };

function toText(rule: Rule): RuleText {
  return {
    first: rule.first === null ? "" : String(rule.first),
    every: String(rule.every),
    unit: rule.unit,
  };
}

// Ogiltigt intervall ger null; då gäller den vanliga regeln tills det rättas.
function toRule(t: RuleText): Rule | null {
  const every = parse(t.every);
  if (every === null || every <= 0) return null;
  const first = parse(t.first);
  return {
    first: t.unit === "months" && first !== null && first > 0 ? first : null,
    every,
    unit: t.unit,
  };
}

function describe(rule: Rule): string {
  return rule.unit === "km"
    ? `var ${fmt(rule.every)} km`
    : `${rule.first ?? rule.every} mån, sedan var ${rule.every} mån`;
}

type Row = {
  key: string;
  label: string;
  base: Rule;
};

const AGE_ROWS: Row[] = EXTRA_SERVICES.map((s) => ({
  key: `age:${s.label}`,
  label: s.label,
  base: ageRule(s),
}));

const KM_ROWS: Row[] = KM_INTERVALS.map((n) => ({
  key: `km:${n}`,
  label: `Var ${fmt(n)} km`,
  base: kmRule(n),
}));

function RuleEditor({
  text,
  base,
  onChange,
  onReset,
  changed,
}: {
  text: RuleText;
  base: RuleText;
  onChange: (t: RuleText) => void;
  onReset: () => void;
  changed: boolean;
}) {
  return (
    <div className="mt-2 space-y-3 rounded-md border bg-muted/40 p-3">
      <div className="flex gap-2">
        {(["months", "km"] as const).map((u) => (
          <button
            key={u}
            type="button"
            aria-pressed={text.unit === u}
            onClick={() => onChange(u === base.unit ? base : { first: "", every: "", unit: u })}
            className={
              text.unit === u
                ? "rounded-md border border-primary bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"
                : "rounded-md border px-3 py-1 text-sm font-medium hover:bg-accent"
            }
          >
            {u === "months" ? "Månader" : "Kilometer"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {text.unit === "months" && (
          <div className="space-y-1">
            <Label className="text-xs">Första gången (mån)</Label>
            <Input
              inputMode="numeric"
              value={text.first}
              onChange={(e) => onChange({ ...text, first: e.target.value })}
            />
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">
            Därefter varje ({text.unit === "months" ? "mån" : "km"})
          </Label>
          <Input
            inputMode="numeric"
            value={text.every}
            onChange={(e) => onChange({ ...text, every: e.target.value })}
          />
        </div>
      </div>
      {changed && (
        <button type="button" onClick={onReset} className="text-sm underline">
          Återställ
        </button>
      )}
    </div>
  );
}

function ServicePage() {
  const [months, setMonths] = useState("");
  const [yearText, setYearText] = useState("");
  const [pick, setPick] = useState<number | null>(null);
  const [km, setKm] = useState("");
  const [custom, setCustom] = useState<Record<string, RuleText>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Månader och år hänger ihop: ändrar man det ena uppdateras det andra.
  function changeMonths(text: string) {
    const m = parse(text);
    setMonths(text);
    setYearText(m === null ? "" : String(monthsToYear(m)));
    setPick(null);
  }
  function changeYear(text: string) {
    const y = parse(text);
    setYearText(text);
    setMonths(y === null ? "" : String(Math.round(y * 12)));
    setPick(null);
  }

  const value = parse(months);
  const choices = value === null ? [] : yearChoices(value);
  const year =
    value === null ? null : pick !== null && choices.includes(pick) ? pick : monthsToYear(value);
  const kmValue = parse(km);
  const ctx = { year, km: kmValue };

  function renderRows(rows: Row[]): ReactNode {
    return (
      <>
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const text = custom[row.key] ?? toText(row.base);
            const changed = JSON.stringify(text) !== JSON.stringify(toText(row.base));
            const rule = toRule(text) ?? row.base;
            const hits = ruleHits(rule, ctx);
            const on = hits !== null && hits.length > 0;
            const isOpen = open === row.key;
            const showHits = hits !== null && hits.length > 0;
            // Rader som inte träffar döljs, utom när de är öppna eller har ett eget intervall.
            if (!on && !showAll && !isOpen && !changed) return null;
            return (
              <li key={row.key}>
                <div
                  className={
                    on
                      ? "flex flex-wrap items-center gap-x-2 font-medium"
                      : "flex flex-wrap items-center gap-x-2 text-muted-foreground"
                  }
                >
                  <span
                    className={
                      on
                        ? "flex size-5 shrink-0 items-center justify-center rounded bg-primary text-xs text-primary-foreground"
                        : "size-5 shrink-0 rounded border"
                    }
                  >
                    {on ? "✓" : ""}
                  </span>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : row.key)}
                    className="whitespace-nowrap text-left underline decoration-dotted underline-offset-4"
                  >
                    {row.label}
                  </button>
                  {changed && toRule(text) !== null && (
                    <span className="text-sm font-normal text-muted-foreground">
                      eget: {describe(rule)}
                    </span>
                  )}
                  {showHits && (
                    <span className="text-sm font-normal text-muted-foreground">
                      (
                      {hits
                        .slice(0, 5)
                        .map((h) =>
                          rule.unit === "km"
                            ? `${fmt(h)} · ${ordinal(occurrenceNumber(rule, h))}`
                            : ordinal(occurrenceNumber(rule, h)),
                        )
                        .join(", ")}
                      {hits.length > 5 ? ` … +${hits.length - 5}` : ""})
                    </span>
                  )}
                  {hits === null && (
                    <span className="text-sm font-normal text-muted-foreground">
                      (ange {rule.unit === "km" ? "km" : "ålder"})
                    </span>
                  )}
                </div>
                {isOpen && (
                  <RuleEditor
                    text={text}
                    base={toText(row.base)}
                    changed={changed}
                    onChange={(t) => setCustom({ ...custom, [row.key]: t })}
                    onReset={() => {
                      const { [row.key]: _removed, ...rest } = custom;
                      setCustom(rest);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-3 text-sm underline"
        >
          {showAll ? "Dölj intervall som inte träffar" : "Visa alla intervall"}
        </button>
      </>
    );
  }

  const anyOn = (rows: Row[]) =>
    rows.some((r) => {
      const hits = ruleHits(toRule(custom[r.key] ?? toText(r.base)) ?? r.base, ctx);
      return hits !== null && hits.length > 0;
    });

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Wrench className="size-5" /> Serviceschema
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Skriv in ålder och mätarställning så visas tilläggsservicarna. Klicka på en rad för att
          skriva in ett eget intervall i månader eller km.
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
                {!anyOn(AGE_ROWS) && (
                  <p className="mt-2 font-medium">Inga tilläggsservicar detta år.</p>
                )}
                {renderRows(AGE_ROWS)}
              </div>
            )}
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

            {kmValue !== null && (
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">
                  Intervall mellan {fmt(Math.max(0, kmValue - 10_000))} och {fmt(kmValue + 10_000)}{" "}
                  km
                </p>
                {!anyOn(KM_ROWS) && (
                  <p className="mt-2 font-medium">Inga körsträcksintervall träffar.</p>
                )}
                {renderRows(KM_ROWS)}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
