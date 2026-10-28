import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EXTRA_SERVICES,
  KM_INTERVALS,
  isHalfYear,
  kmHits,
  monthsToYear,
  servicesForYear,
  yearChoices,
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

function parse(text: string): number | null {
  const n = Number(text.replace(/\s/g, "").replace(",", "."));
  return text.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}

function CheckList({ rows }: { rows: { key: string; label: ReactNode; on: boolean }[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((r) => (
        <li
          key={r.key}
          className={
            r.on
              ? "flex items-center gap-2 font-medium"
              : "flex items-center gap-2 text-muted-foreground"
          }
        >
          <span
            className={
              r.on
                ? "flex size-5 shrink-0 items-center justify-center rounded bg-primary text-xs text-primary-foreground"
                : "size-5 shrink-0 rounded border"
            }
          >
            {r.on ? "✓" : ""}
          </span>
          <span>{r.label}</span>
        </li>
      ))}
    </ul>
  );
}

function ServicePage() {
  const [months, setMonths] = useState("");
  const [yearText, setYearText] = useState("");
  const [pick, setPick] = useState<number | null>(null);
  const [km, setKm] = useState("");

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
  const due = year === null ? [] : servicesForYear(year);

  const kmValue = parse(km);
  const kmDue = kmValue === null ? [] : KM_INTERVALS.filter((n) => kmHits(kmValue, n).length > 0);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Wrench className="size-5" /> Serviceschema
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Skriv in ålder och mätarställning så visas tilläggsservicarna.
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
                {due.length === 0 && (
                  <p className="mt-2 font-medium">Inga tilläggsservicar detta år.</p>
                )}
                <CheckList
                  rows={EXTRA_SERVICES.map((s) => ({
                    key: s.label,
                    label: s.label,
                    on: due.includes(s),
                  }))}
                />
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
                  Intervall mellan {Math.max(0, kmValue - 10_000).toLocaleString("sv-SE")} och{" "}
                  {(kmValue + 10_000).toLocaleString("sv-SE")} km
                </p>
                {kmDue.length === 0 && (
                  <p className="mt-2 font-medium">Inga körsträcksintervall träffar.</p>
                )}
                <CheckList
                  rows={KM_INTERVALS.map((n) => {
                    const on = kmDue.includes(n);
                    return {
                      key: String(n),
                      on,
                      label: (
                        <>
                          Var {n.toLocaleString("sv-SE")} km
                          {on && (
                            <span className="ml-1 text-sm font-normal text-muted-foreground">
                              (
                              {kmHits(kmValue, n)
                                .map((m) => m.toLocaleString("sv-SE"))
                                .join(", ")}
                              )
                            </span>
                          )}
                        </>
                      ),
                    };
                  })}
                />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
