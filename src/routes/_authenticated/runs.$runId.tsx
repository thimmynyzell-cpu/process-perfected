import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useT } from "@/i18n";
import { logAudit } from "@/lib/auth";
import { OrgPage, Spinner, nativeSelect, type OrgContext } from "@/components/OrgPage";
import { RunStatusBadge } from "@/components/RunStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { visibleKeys } from "@/lib/flow";

type Item = Database["public"]["Tables"]["template_items"]["Row"];
type Answer = { value: Json | null; note: string; photo_url: string };

export const Route = createFileRoute("/_authenticated/runs/$runId")({
  head: () => ({ meta: [{ title: "Körning — Checklista" }] }),
  component: () => <OrgPage>{(ctx) => <RunView ctx={ctx} />}</OrgPage>,
});

function isFilled(item: Item, a?: Answer) {
  const v = a?.value;
  if (item.type === "checkbox") return v === true;
  return v !== null && v !== undefined && String(v).trim() !== "";
}

function RunView({ ctx }: { ctx: OrgContext }) {
  const t = useT();
  const qc = useQueryClient();
  const { runId } = Route.useParams();

  const query = useQuery({
    queryKey: ["run", runId],
    queryFn: async () => {
      const { data: run, error } = await supabase
        .from("runs")
        .select("*, templates(title), template_versions(version)")
        .eq("id", runId)
        .single();
      if (error) throw error;
      const [{ data: items }, { data: answers }] = await Promise.all([
        supabase.from("template_items").select("*").eq("version_id", run.version_id).order("position"),
        supabase.from("run_answers").select("*").eq("run_id", runId),
      ]);
      return { run, items: items ?? [], answers: answers ?? [] };
    },
  });

  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  useEffect(() => {
    if (!query.data) return;
    const map: Record<string, Answer> = {};
    for (const a of query.data.answers) map[a.item_id] = { value: a.value, note: a.note ?? "", photo_url: a.photo_url ?? "" };
    setAnswers(map);
  }, [query.data]);

  const sections = useMemo(() => {
    const groups: { name: string; items: Item[] }[] = [];
    for (const item of query.data?.items ?? []) {
      const name = item.section ?? "";
      const last = groups.at(-1);
      if (last && last.name === name) last.items.push(item);
      else groups.push({ name, items: [item] });
    }
    return groups;
  }, [query.data]);

  if (query.isPending) return <Spinner />;
  if (query.error || !query.data) return <p className="text-muted-foreground">{t("error.generic")}</p>;

  const { run } = query.data;
  const all = query.data.items;
  const posId = new Map(all.map((i) => [i.position, i.id]));
  const vis = visibleKeys(
    all.map((i) => ({
      key: i.id,
      label: i.label,
      type: i.type,
      required: i.required,
      options: [],
      parentKey: i.parent_position != null ? (posId.get(i.parent_position) ?? null) : null,
      showWhen: i.show_when,
    })),
    Object.fromEntries(Object.entries(answers).map(([k, a]) => [k, a.value])),
  );
  const items = all.filter((i) => vis.has(i.id));
  const done = run.status === "completed";
  const filled = items.filter((i) => isFilled(i, answers[i.id])).length;
  const pct = items.length ? Math.round((filled / items.length) * 100) : 0;

  async function persist(itemId: string, next: Answer) {
    setAnswers((prev) => ({ ...prev, [itemId]: next }));
    const { error } = await supabase.from("run_answers").upsert(
      {
        run_id: runId,
        org_id: ctx.orgId,
        item_id: itemId,
        value: next.value,
        note: next.note || null,
        photo_url: next.photo_url || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "run_id,item_id" },
    );
    if (error) toast.error(error.message);
  }

  const setLocal = (itemId: string, patch: Partial<Answer>) =>
    setAnswers((prev) => ({
      ...prev,
      [itemId]: { value: null, note: "", photo_url: "", ...prev[itemId], ...patch },
    }));

  const current = (itemId: string): Answer => answers[itemId] ?? { value: null, note: "", photo_url: "" };

  async function complete() {
    const missing = items.filter((i) => i.required && !isFilled(i, answers[i.id]));
    if (missing.length) { toast.error(t("run.missingRequired")); return; }
    const { error } = await supabase
      .from("runs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", runId);
    if (error) { toast.error(error.message); return; }
    await logAudit(ctx.orgId, ctx.userId, "run.completed", "run", runId, { reference: run.reference });
    toast.success(t("run.completedToast"));
    qc.invalidateQueries({ queryKey: ["run", runId] });
    qc.invalidateQueries({ queryKey: ["runs", ctx.orgId] });
  }

  return (
    <div className="pb-28">
      <Link to="/history" className="no-print mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("common.back")}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {run.templates?.title} · {t("templates.version")} {run.template_versions?.version}
          </p>
          <h1 className="text-2xl font-semibold md:text-3xl">{run.reference || "—"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("run.startedAt")} {new Date(run.started_at).toLocaleString()}
            {run.due_at && ` · ${t("run.due")} ${new Date(run.due_at).toLocaleString()}`}
            {run.completed_at && ` · ${t("run.completedAt")} ${new Date(run.completed_at).toLocaleString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RunStatusBadge status={run.status} dueAt={run.due_at} />
          <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
            <Printer className="size-4" /> {t("common.print")}
          </Button>
        </div>
      </div>

      <div className="mb-6 rounded-xl border bg-card p-4">
        <div className="mb-2 flex justify-between text-sm">
          <span>{t("run.progress")}</span>
          <span className="font-medium">
            {filled}/{items.length} · {pct} %
          </span>
        </div>
        <Progress value={pct} />
      </div>

      <div className="space-y-6">
        {sections.filter((s) => s.items.some((i) => vis.has(i.id))).map((section, sIdx) => (
          <section key={sIdx}>
            {section.name && (
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.name}
              </h2>
            )}
            <ul className="divide-y rounded-xl border bg-card">
              {section.items.filter((item) => vis.has(item.id)).map((item) => {
                const a = current(item.id);
                const ok = isFilled(item, a);
                return (
                  <li key={item.id} className="space-y-3 p-4">
                    {item.type === "checkbox" ? (
                      <label className="flex cursor-pointer items-start gap-3">
                        <Checkbox
                          className="mt-0.5 size-6"
                          disabled={done}
                          checked={a.value === true}
                          onCheckedChange={(v) => persist(item.id, { ...a, value: v === true })}
                        />
                        <ItemLabel item={item} ok={ok} />
                      </label>
                    ) : (
                      <>
                        <ItemLabel item={item} ok={ok} />
                        {item.type === "dropdown" ? (
                          <select
                            className={nativeSelect}
                            disabled={done}
                            value={typeof a.value === "string" ? a.value : ""}
                            onChange={(e) => persist(item.id, { ...a, value: e.target.value || null })}
                          >
                            <option value="">—</option>
                            {((item.options as string[]) ?? []).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            type={item.type === "number" ? "number" : "text"}
                            inputMode={item.type === "number" ? "decimal" : undefined}
                            disabled={done}
                            value={a.value === null || a.value === undefined ? "" : String(a.value)}
                            onChange={(e) => setLocal(item.id, { value: e.target.value })}
                            onBlur={(e) =>
                              persist(item.id, {
                                ...a,
                                value:
                                  e.target.value === ""
                                    ? null
                                    : item.type === "number"
                                      ? Number(e.target.value)
                                      : e.target.value,
                              })
                            }
                          />
                        )}
                      </>
                    )}
                    {(item.allow_note || item.allow_photo) && (
                      <div className="grid gap-2 pl-0 md:grid-cols-2 md:pl-9">
                        {item.allow_note && (
                          <Input
                            placeholder={t("run.note")}
                            disabled={done}
                            value={a.note}
                            onChange={(e) => setLocal(item.id, { note: e.target.value })}
                            onBlur={() => persist(item.id, current(item.id))}
                          />
                        )}
                        {item.allow_photo && (
                          <Input
                            placeholder={t("run.photo")}
                            type="url"
                            disabled={done}
                            value={a.photo_url}
                            onChange={(e) => setLocal(item.id, { photo_url: e.target.value })}
                            onBlur={() => persist(item.id, current(item.id))}
                          />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {!done && (
        <div className="no-print fixed inset-x-0 bottom-0 z-10 border-t bg-background/90 p-4 backdrop-blur md:left-64">
          <div className="mx-auto max-w-5xl">
            <Button size="lg" className="w-full" onClick={complete}>
              <CheckCircle2 className="size-5" /> {t("run.complete")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemLabel({ item, ok }: { item: Item; ok: boolean }) {
  return (
    <div className="min-w-0">
      <p className={cn("font-medium leading-snug", ok && item.type === "checkbox" && "text-muted-foreground line-through")}>
        {item.label}
        {item.required && <span className="ml-1 text-destructive">*</span>}
      </p>
      {item.help_text && <p className="mt-0.5 text-xs text-muted-foreground">{item.help_text}</p>}
    </div>
  );
}
