import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";
import { logAudit } from "@/lib/auth";
import { OrgPage, Spinner, EmptyState, nativeSelect, type OrgContext } from "@/components/OrgPage";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const active = (templates.data ?? []).filter((x) => x.status === "active" && !x.is_base);

  useEffect(() => {
    if (!templateId && active[0]) setTemplateId(active[0].id);
  }, [active, templateId]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: ver, error: vErr } = await supabase
        .from("template_versions")
        .select("id")
        .eq("template_id", templateId)
        .order("version", { ascending: false })
        .limit(1)
        .single();
      if (vErr) throw vErr;
      const { data: run, error } = await supabase
        .from("runs")
        .insert({
          org_id: ctx.orgId,
          template_id: templateId,
          version_id: ver.id,
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
      <PageHeader title={t("run.start")} />
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
        <form onSubmit={start} className="max-w-lg space-y-4 rounded-xl border bg-card p-5 shadow-soft">
          <div className="space-y-1.5">
            <Label>{t("run.pickTemplate")}</Label>
            <select className={nativeSelect} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {active.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref">{t("run.reference")}</Label>
            <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="due">
              {t("run.due")} ({t("common.optional")})
            </Label>
            <Input id="due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy || !templateId}>
            {t("run.begin")}
          </Button>
        </form>
      )}
    </>
  );
}
