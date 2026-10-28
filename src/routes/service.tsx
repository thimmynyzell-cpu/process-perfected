import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXTRA_SERVICES, monthsToYear, servicesForYear } from "@/lib/serviceSchedule";

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
  const value = Number(months.replace(",", "."));
  const valid = months.trim() !== "" && Number.isFinite(value) && value >= 0;
  const year = valid ? monthsToYear(value) : null;
  const due = year === null ? [] : servicesForYear(year);

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
            onChange={(e) => setMonths(e.target.value)}
          />
        </div>

        {year !== null && (
          <section className="mt-6 rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              {value} månader ≈ <span className="font-semibold text-foreground">år {year}</span> (
              {year * 12} månader)
            </p>
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
