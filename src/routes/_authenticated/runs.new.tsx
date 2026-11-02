import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Folder, ListChecks, PlayCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { currentVersionId } from "@/lib/versions";
import { folderOf } from "@/lib/items";
import { useT } from "@/i18n";
import { logAudit } from "@/lib/auth";
import { OrgPage, Spinner, EmptyState, type OrgContext } from "@/components/OrgPage";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/runs/new")({
  validateSearch: z.object({ template: z.string().optional() }),
  head: () => ({ meta: [{ title: "Starta körning — Checklista" }] }),
  component: () => <OrgPage>{(ctx) => <NewRun ctx={ctx} />}</OrgPage>,
});

function NewRun({ ctx }: { ctx: OrgContext }) {
  const t = useT();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [templateId, setTemplateId] = useState(search.template ?? "");
  const [query, setQuery] = useState("");
  const [reference, setReference] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const templates = useQuery({
    queryKey: ["templates", ctx.orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .eq("org_id", ctx.orgId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const active = useMemo(
    () => (templates.data ?? []).filter((x) => x.status === "active" && !x.is_base && !x.delete_after),
    [templates.data],
  );
  // One checklist: no choice to make, so it is picked for the user.
  useEffect(() => {
    if (!templateId && active.length === 1) setTemplateId(active[0]!.id);
  }, [active, templateId]);

  const q = query.trim().toLowerCase();
  const shown = active.filter((x) => !q || [x.title, x.description, x.category].some((v) => v?.toLowerCase().includes(q)));
  // Grouped by folder, folders in alphabetical order, checklists by name.
  const groups = [...new Set(shown.map((x) => folderOf(x.category)))]
    .sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "sv")))
    .map((f) => ({ folder: f, list: shown.filter((x) => folderOf(x.category) === f).sort((a, b) => a.title.localeCompare(b.title, "sv")) }));
  const picked = active.find((x) => x.id === templateId);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    setBusy(true);
    try {
      const verId = await currentVersionId(picked.id, picked.current_version);
      if (!verId) throw new Error(t("error.generic"));
      const { data: run, error } = await supabase
        .from("runs")
        .insert({
          org_id: ctx.orgId,
          template_id: picked.id,
          version_id: verId,
          reference: reference.trim() || null,
          due_at: due ? new Date(due).toISOString() : null,
          started_by: ctx.userId,
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit(ctx.orgId, ctx.userId, "run.started", "run", run.id, { reference });
      navigate({ to: "/runs/$runId", params: { runId: run.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error.generic"));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t("run.start")} description={t("run.startDesc")} />
      {templates.isPending ? (
        <Spinner />
      ) : active.length === 0 ? (
        <EmptyState>
          {t("run.noTemplates")}{" "}
          <Link to="/templates" className="text-primary hover:underline">
            {t("templates.title")}
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <section>
            {active.length > 4 && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={t("templates.search")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
            )}
            {groups.length === 0 && <EmptyState>{t("run.noMatch")}</EmptyState>}
            <div className="space-y-6">
              {groups.map((g) => (
                <div key={g.folder || "none"}>
                  {(groups.length > 1 || g.folder) && (
                    <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Folder className="size-3.5" /> {g.folder || t("templates.noFolder")}
                    </h2>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t("run.pickTemplate")}>
                    {g.list.map((tpl) => {
                      const on = tpl.id === templateId;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setTemplateId(tpl.id)}
                          className={cn(
                            "group relative flex flex-col items-start rounded-xl border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift",
                            on && "border-primary ring-2 ring-primary/30",
                          )}
                        >
                          <span className="flex w-full items-start justify-between gap-2">
                            <span className="font-semibold leading-snug">{tpl.title}</span>
                            <span
                              className={cn(
                                "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                                on ? "border-primary bg-primary text-primary-foreground" : "border-border group-hover:border-primary/50",
                              )}
                            >
                              {on && <CheckCircle2 className="size-4" />}
                            </span>
                          </span>
                          {tpl.description && (
                            <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tpl.description}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <form onSubmit={start} className="space-y-4 rounded-xl border bg-card p-5 shadow-soft">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("run.chosen")}</p>
                {picked ? (
                  <p className="mt-1 flex items-center gap-2 font-semibold">
                    <ListChecks className="size-4 text-primary" /> {picked.title}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">{t("run.pickFirst")}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ref">{t("run.reference")}</Label>
                <Input
                  id="ref"
                  placeholder={t("run.referencePlaceholder")}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="due">
                  {t("run.due")} ({t("common.optional")})
                </Label>
                <Input id="due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={busy || !picked}>
                <PlayCircle className="size-5" /> {t("run.begin")}
              </Button>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
