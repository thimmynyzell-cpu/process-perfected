import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
} from "@/lib/serviceSchedule";

export const Route = createFileRoute("/service")({
  head: () => ({
    meta: [
      { title: "Serviceschema — tilläggsservicar" },
      {
        name: "description",
        content: "Skriv in antal månader och se vilka tilläggsservicar som ska med.",
      },
    ],
  }),
  component: ServicePage,
});

function ServicePage() {
  const [months, setMonths] = useState("");
  const [yearText, setYearText] = useState("");
  const [km, setKm] = useState("");
  const value = Number(months.replace(",", "."));
  const valid = months.trim() !== "" && Number.isFinite(value) && value >= 0;
  const year = valid ? monthsToYear(value) : null;
  const due = year === null ? [] : servicesForYear(year);
  const half = valid && isHalfYear(value);
  const lowerYear = half ? year! - 1 : null;
  const lowerDue = lowerYear === null ? [] : servicesForYear(lowerYear);

  // Månader och år hänger ihop: ändrar man det ena uppdateras det andra.
  function changeMonths(text: string) {
    setMonths(text);
    const m = Number(text.replace(",", "."));
    setYearText(text.trim() !== "" && Number.isFinite(m) && m >= 0 ? String(monthsToYear(m)) : "");
  }
  function changeYear(text: string) {
    setYearText(text);
    const y = Number(text.replace(",", "."));
    setMonths(text.trim() !== "" && Number.isFinite(y) && y >= 0 ? String(Math.round(y * 12)) : "");
  }
  const kmValue = Number(km.replace(/\s/g, "").replace(",", "."));
  const kmValid = km.trim() !== "" && Number.isFinite(kmValue) && kmValue >= 0;
  const kmDue = kmValid ? KM_INTERVALS.filter((n) => kmHits(kmValue, n).length > 0) : [];

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Wrench className="size-5" /> Serviceschema
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Skriv in antal månader så visas tilläggsservicarna för det året.
        </p>

        <div className="mt-6 space-y-2">
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

        <div className="mt-6 space-y-2">
          <Label htmlFor="year">eller år</Label>
          <Input
            id="year"
            inputMode="decimal"
            placeholder="t.ex. 12"
            value={yearText}
            onChange={(e) => changeYear(e.target.value)}
          />
        </div>

        <div className="mt-6 space-y-2">
          <Label htmlFor="km">Mätarställning (km)</Label>
          <Input
            id="km"
            inputMode="numeric"
            placeholder="t.ex. 60000"
            value={km}
            onChange={(e) => setKm(e.target.value)}
          />
        </div>

        {kmValid && (
          <section className="mt-6 rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              Intervall mellan {Math.max(0, kmValue - 10_000).toLocaleString("sv-SE")} och{" "}
              {(kmValue + 10_000).toLocaleString("sv-SE")} km
            </p>
            {kmDue.length === 0 ? (
              <p className="mt-3 font-medium">Inga körsträcksintervall träffar.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {KM_INTERVALS.map((n) => {
                  const on = kmDue.includes(n);
                  return (
                    <li
                      key={n}
                      className={
                        on
                          ? "flex items-center gap-2 font-medium"
                          : "flex items-center gap-2 text-muted-foreground"
                      }
                    >
                      <span
                        className={
                          on
                            ? "flex size-5 items-center justify-center rounded bg-primary text-xs text-primary-foreground"
                            : "size-5 rounded border"
                        }
                      >
                        {on ? "✓" : ""}
                      </span>
                      Var {n.toLocaleString("sv-SE")} km
                      {on && (
                        <span className="text-sm font-normal text-muted-foreground">
                          (
                          {kmHits(kmValue, n)
                            .map((m) => m.toLocaleString("sv-SE"))
                            .join(", ")}
                          )
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {year !== null && (
          <section className="mt-6 rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              {value} månader ≈ <span className="font-semibold text-foreground">år {year}</span> (
              {year * 12} månader)
            </p>
            {half && (
              <p className="mt-3 rounded-md border border-amber-500 bg-amber-500/10 p-3 text-sm font-medium">
                Mitt emellan år {lowerYear} och år {year}. Avrundat uppåt till år {year}. Året under
                (år {lowerYear}):{" "}
                {lowerDue.length === 0
                  ? "inga tilläggsservicar"
                  : lowerDue.map((s) => s.label).join(" · ")}
                .
              </p>
            )}
            {due.length === 0 ? (
              <p className="mt-3 font-medium">Inga tilläggsservicar detta år.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {EXTRA_SERVICES.map((s) => {
                  const on = due.includes(s);
                  return (
                    <li
                      key={s.label}
                      className={
                        on
                          ? "flex items-center gap-2 font-medium"
                          : "flex items-center gap-2 text-muted-foreground"
                      }
                    >
                      <span
                        className={
                          on
                            ? "flex size-5 items-center justify-center rounded bg-primary text-xs text-primary-foreground"
                            : "size-5 rounded border"
                        }
                      >
                        {on ? "✓" : ""}
                      </span>
                      {s.label}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
