import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";
import { planHas } from "@/lib/plans";
import { downloadCsv, formatAnswer } from "@/lib/export";
import { OrgPage, Spinner, EmptyState, nativeSelect, type OrgContext } from "@/components/OrgPage";
import { PageHeader } from "@/components/AppShell";
import { RunStatusBadge } from "@/components/RunStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Historik — Checklista" }] }),
  component: () => <OrgPage>{(ctx) => <History ctx={ctx} />}</OrgPage>,
});

function History({ ctx }: { ctx: OrgContext }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [template, setTemplate] = useState("");

  const data = useQuery({
    queryKey: ["runs", ctx.orgId, "history"],
    queryFn: async () => {
      const [{ data: runs, error }, { data: profiles }] = await Promise.all([
        supabase
          .from("runs")
          .select("*, templates(title)")
          .eq("org_id", ctx.orgId)
          .order("started_at", { ascending: false })
          .limit(1000),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      if (error) throw error;
      const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || ""]));
      return (runs ?? []).map((r) => ({ ...r, starter: r.started_by ? names.get(r.started_by) ?? "" : "" }));
    },
  });

  const runs = data.data ?? [];
  const templates = Array.from(new Map(runs.map((r) => [r.template_id, r.templates?.title ?? ""])).entries());
  const needle = q.toLowerCase();
  const filtered = runs.filter(
    (r) =>
      (!status || r.status === status) &&
      (!template || r.template_id === template) &&
      (!needle ||
        (r.reference ?? "").toLowerCase().includes(needle) ||
        (r.templates?.title ?? "").toLowerCase().includes(needle)),
  );

  async function exportCsv() {
    if (!planHas(ctx.organization.plan, "export")) {
      return toast.error(t("limit.upgradeCta"), {
        action: { label: t("billing.upgrade"), onClick: () => (window.location.href = "/billing") },
      });
    }
    const ids = filtered.map((r) => r.id);
    const versionIds = Array.from(new Set(filtered.map((r) => r.version_id)));
    const [{ data: answers }, { data: items }] = await Promise.all([
      supabase.from("run_answers").select("*").in("run_id", ids),
      supabase.from("template_items").select("id, label, section").in("version_id", versionIds),
    ]);
    const labels = new Map((items ?? []).map((i) => [i.id, i]));
    const rows: (string | number | null)[][] = [
      ["Referens", "Mall", "Status", "Startad av", "Startad", "Klar", "Avsnitt", "Punkt", "Svar", "Anteckning"],
    ];
    for (const r of filtered) {
      const base = [
        r.reference,
        r.templates?.title ?? "",
        r.status === "completed" ? t("run.completed") : t("run.inProgress"),
        r.starter,
        new Date(r.started_at).toLocaleString(),
        r.completed_at ? new Date(r.completed_at).toLocaleString() : "",
      ];
      const own = (answers ?? []).filter((a) => a.run_id === r.id);
      if (!own.length) rows.push([...base, "", "", "", ""]);
      for (const a of own) {
        const item = labels.get(a.item_id);
        rows.push([...base, item?.section ?? "", item?.label ?? "", formatAnswer(a.value), a.note]);
      }
    }
    downloadCsv(`korningar-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  return (
    <>
      <PageHeader
        title={t("history.title")}
        action={
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="size-4" /> {t("history.exportCsv")}
          </Button>
        }
      />
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_12rem_12rem]">
        <Input placeholder={t("history.searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={nativeSelect} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">
            {t("history.status")}: {t("common.all")}
          </option>
          <option value="in_progress">{t("run.inProgress")}</option>
          <option value="completed">{t("run.completed")}</option>
        </select>
        <select className={nativeSelect} value={template} onChange={(e) => setTemplate(e.target.value)}>
          <option value="">
            {t("history.template")}: {t("common.all")}
          </option>
          {templates.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
      </div>

      {data.isPending ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState>{t("history.empty")}</EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                to="/runs/$runId"
                params={{ runId: r.id }}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.reference || "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.templates?.title} · {r.starter} · {new Date(r.started_at).toLocaleString()}
                  </p>
                </div>
                <RunStatusBadge status={r.status} dueAt={r.due_at} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
