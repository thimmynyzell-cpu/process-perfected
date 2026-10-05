import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";
import { OrgPage, Spinner, EmptyState, type OrgContext } from "@/components/OrgPage";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { RunStatusBadge } from "@/components/RunStatusBadge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Översikt — Checklista" }] }),
  component: () => <OrgPage>{(ctx) => <Dashboard ctx={ctx} />}</OrgPage>,
});

function Dashboard({ ctx }: { ctx: OrgContext }) {
  const t = useT();
  const runs = useQuery({
    queryKey: ["runs", ctx.orgId, "dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("runs")
        .select("id, reference, status, started_at, due_at, completed_at, templates(title)")
        .eq("org_id", ctx.orgId)
        .order("started_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const list = runs.data ?? [];
  const now = Date.now();
  const today = new Date().toDateString();
  const active = list.filter((r) => r.status === "in_progress");
  const completed = list.filter((r) => r.status === "completed");
  const stats = [
    { label: t("dashboard.active"), value: active.length },
    {
      label: t("dashboard.completedToday"),
      value: completed.filter((r) => r.completed_at && new Date(r.completed_at).toDateString() === today).length,
    },
    {
      label: t("dashboard.completionRate"),
      value: list.length ? `${Math.round((completed.length / list.length) * 100)} %` : "–",
    },
    {
      label: t("dashboard.overdue"),
      value: active.filter((r) => r.due_at && new Date(r.due_at).getTime() < now).length,
    },
  ];

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        action={
          <Button asChild>
            <Link to="/runs/new">
              <PlayCircle className="size-4" /> {t("dashboard.startRun")}
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4 shadow-soft">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("dashboard.recent")}</h2>
        <Link to="/history" className="text-sm text-primary hover:underline">
          {t("dashboard.viewAll")}
        </Link>
      </div>
      <div className="mt-3">
        {runs.isPending ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState>{t("dashboard.empty")}</EmptyState>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {list.slice(0, 8).map((r) => (
              <li key={r.id}>
                <Link
                  to="/runs/$runId"
                  params={{ runId: r.id }}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.reference || "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.templates?.title} · {new Date(r.started_at).toLocaleString()}
                    </p>
                  </div>
                  <RunStatusBadge status={r.status} dueAt={r.due_at} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
