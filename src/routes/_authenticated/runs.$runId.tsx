import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Eye, EyeOff, Printer } from "lucide-react";
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
import { jumpKeys, lanesOf, visibleKeys } from "@/lib/flow";
import { colorTree } from "@/lib/laneColors";
import { shownForLevel } from "@/lib/levels";
import { sectionOrder } from "@/lib/sections";
import { Hint } from "@/components/Hint";

type Item = Database["public"]["Tables"]["template_items"]["Row"];
type Answer = { value: Json | null; note: string; photo_url: string };

export const Route = createFileRoute("/_authenticated/runs/$runId")({
  head: () => ({ meta: [{ title: "Körning — Checklista" }] }),
  component: () => <OrgPage>{(ctx) => <RunView ctx={ctx} />}</OrgPage>,
});

function isFilled(item: Item, a?: Answer) {
  const v = a?.value;
  if (item.type === "checkbox") return Array.isArray(v) ? v.length > 0 : v === true;
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
  // Also show questions meant for other levels than the member's own.
  const [otherLevels, setOtherLevels] = useState(false);
  // Section the agent is working in; the others are hidden.
  const [chapter, setChapter] = useState<string | null>(null);
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
  const nodes = all.map((i) => ({
    key: i.id,
    label: i.label,
    type: i.type,
    required: i.required,
    options: Array.isArray(i.options) ? (i.options as string[]) : [],
    parentKey: i.parent_position != null ? (posId.get(i.parent_position) ?? null) : null,
    showWhen: i.show_when,
    jumps: jumpKeys(i.jump_to, posId),
    section: i.section,
  }));
  const values = Object.fromEntries(Object.entries(answers).map(([k, a]) => [k, a.value]));
  const ownLevel = visibleKeys(
    all.map((i, idx) => ({ ...nodes[idx]!, hidden: !shownForLevel(i.levels, ctx.level) })),
    values,
  );
  const anyLevel = visibleKeys(nodes, values);
  // Same branch colors as the editor: questions in a branch and the answers leading there.
  const colors = colorTree(nodes, lanesOf);
  const yesNo = (v: string) => (v === "true" ? t("flow.yes") : v === "false" ? t("flow.no") : v);
  const vis = otherLevels ? anyLevel : ownLevel;
  // Questions shown only because other levels are switched on; they are optional.
  const extra = new Set([...anyLevel].filter((k) => !ownLevel.has(k)));
  const items = all.filter((i) => vis.has(i.id));
  const chapters = sectionOrder(items.map((i) => i.section));
  const activeChapter = chapter && chapters.includes(chapter) ? chapter : (chapters[0] ?? null);
  const chapterIdx = activeChapter ? chapters.indexOf(activeChapter) : -1;
  // Questions without a section are shown in every section.
  const inChapter = (i: { section: string | null }) =>
    chapters.length < 2 || !(i.section ?? "").trim() || (i.section ?? "").trim() === activeChapter;
  const goTo = (c: string) => {
    setChapter(c);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
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
    const missing = items.filter((i) => i.required && !extra.has(i.id) && !isFilled(i, answers[i.id]));
    if (missing.length) {
      const where = (missing[0]!.section ?? "").trim();
      if (chapters.length > 1 && where && where !== activeChapter) {
        goTo(where);
        toast.error(t("section.missingIn", { section: where }));
      } else toast.error(t("run.missingRequired"));
      return;
    }
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
        {extra.size > 0 && (
          <div className="mt-3 flex justify-end">
            <Hint text={t("level.showOthersHint")}>
              <Button size="sm" variant="ghost" onClick={() => setOtherLevels((v) => !v)}>
                {otherLevels ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                {t(otherLevels ? "level.hideOthers" : "level.showOthers", { count: extra.size })}
              </Button>
            </Hint>
          </div>
        )}
      </div>

      {chapters.length > 1 && (
        <div className="mb-4 flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            aria-label={t("section.prev")}
            disabled={chapterIdx <= 0}
            onClick={() => goTo(chapters[chapterIdx - 1]!)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <select
            className={nativeSelect + " flex-1 font-medium"}
            aria-label={t("section.title")}
            value={activeChapter ?? ""}
            onChange={(e) => goTo(e.target.value)}
          >
            {chapters.map((c, i) => {
              const inC = items.filter((it) => (it.section ?? "").trim() === c);
              const doneC = inC.filter((it) => isFilled(it, answers[it.id])).length;
              return (
                <option key={c} value={c}>
                  {i + 1}. {c} ({doneC}/{inC.length})
                </option>
              );
            })}
          </select>
          <Button
            size="icon"
            variant="outline"
            aria-label={t("section.next")}
            disabled={chapterIdx >= chapters.length - 1}
            onClick={() => goTo(chapters[chapterIdx + 1]!)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      <div className="space-y-6">
        {sections.filter((s) => s.items.some((i) => vis.has(i.id) && inChapter(i))).map((section, sIdx) => (
          <section key={sIdx}>
            {section.name && (
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.name}
              </h2>
            )}
            <ul className="divide-y rounded-xl border bg-card">
              {section.items.filter((item) => vis.has(item.id) && inChapter(item)).map((item) => {
                const a = current(item.id);
                const ok = isFilled(item, a);
                return (
                  <li
                    key={item.id}
                    className={cn("space-y-3 p-4", colors.item.get(item.id) && cn("border-l-4", colors.item.get(item.id)!.color.bar))}
                  >
                    {colors.item.get(item.id)?.values.length && colors.item.get(item.id)!.first ? (
                      <p className={cn("flex items-center gap-1.5 text-[11px] font-semibold", colors.item.get(item.id)!.color.text)}>
                        <span className={cn("size-2 rounded-full", colors.item.get(item.id)!.color.dot)} />
                        {t("flow.if")} {colors.item.get(item.id)!.values.map(yesNo).join(" / ")}
                      </p>
                    ) : null}
                    {item.type === "checkbox" && Array.isArray(item.options) && item.options.length > 0 ? (
                      <>
                        <ItemLabel item={item} ok={ok} extra={extra.has(item.id)} />
                        <div className="space-y-2 pl-1">
                          {(item.options as string[]).map((o) => {
                            const sel = Array.isArray(a.value) ? (a.value as string[]) : [];
                            return (
                              <label key={o} className="flex cursor-pointer items-center gap-3 text-sm">
                                <Checkbox
                                  className="size-5"
                                  disabled={done}
                                  checked={sel.includes(o)}
                                  onCheckedChange={(v) =>
                                    persist(item.id, {
                                      ...a,
                                      value: v === true ? [...sel.filter((x) => x !== o), o] : sel.filter((x) => x !== o),
                                    })
                                  }
                                />
                                {colors.answers.get(item.id)?.[o] && (
                                  <span className={cn("size-2.5 shrink-0 rounded-full", colors.answers.get(item.id)![o]!.dot)} />
                                )}
                                {o}
                              </label>
                            );
                          })}
                        </div>
                      </>
                    ) : item.type === "checkbox" ? (
                      <label className="flex cursor-pointer items-start gap-3">
                        <Checkbox
                          className="mt-0.5 size-6"
                          disabled={done}
                          checked={a.value === true}
                          onCheckedChange={(v) => persist(item.id, { ...a, value: v === true })}
                        />
                        <ItemLabel item={item} ok={ok} extra={extra.has(item.id)} />
                        {colors.answers.get(item.id) && (
                          <span className="ml-auto flex shrink-0 gap-2 text-xs text-muted-foreground">
                            {Object.entries(colors.answers.get(item.id)!).map(([v, c]) => (
                              <span key={v} className="inline-flex items-center gap-1">
                                <span className={cn("size-2.5 rounded-full", c.dot)} /> {yesNo(v)}
                              </span>
                            ))}
                          </span>
                        )}
                      </label>
                    ) : (
                      <>
                        <ItemLabel item={item} ok={ok} extra={extra.has(item.id)} />
                        {item.type === "dropdown" && colors.answers.get(item.id) ? (
                          // Branching choices as colored buttons, so the branch color is visible.
                          <div className="flex flex-wrap gap-2" role="radiogroup">
                            {((item.options as string[]) ?? []).map((o) => {
                              const c = colors.answers.get(item.id)![o];
                              const on = a.value === o;
                              return (
                                <button
                                  key={o}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  disabled={done}
                                  onClick={() => persist(item.id, { ...a, value: on ? null : o })}
                                  className={cn(
                                    "inline-flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors",
                                    c ? c.border : "border-border",
                                    on ? cn(c?.bg ?? "bg-muted", "ring-2 ring-offset-1", "ring-current", c?.text) : "bg-card hover:bg-muted",
                                  )}
                                >
                                  {c && <span className={cn("size-2.5 rounded-full", c.dot)} />}
                                  {o}
                                </button>
                              );
                            })}
                          </div>
                        ) : item.type === "dropdown" ? (
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

      {chapters.length > 1 && chapterIdx < chapters.length - 1 && (
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => goTo(chapters[chapterIdx + 1]!)}>
            {t("section.next")}: {chapters[chapterIdx + 1]} <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

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

function ItemLabel({ item, ok, extra }: { item: Item; ok: boolean; extra: boolean }) {
  const t = useT();
  return (
    <div className="min-w-0">
      <p className={cn("font-medium leading-snug", ok && item.type === "checkbox" && "text-muted-foreground line-through")}>
        {item.label}
        {item.required && !extra && <span className="ml-1 text-destructive">*</span>}
        {extra && (
          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle text-[11px] font-medium text-muted-foreground">
            {t("level.otherLevel")}
          </span>
        )}
      </p>
      {item.help_text && <p className="mt-0.5 text-xs text-muted-foreground">{item.help_text}</p>}
    </div>
  );
}
