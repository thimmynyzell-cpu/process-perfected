import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Archive, Copy, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";
import { canManage, logAudit } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { OrgPage, Spinner, EmptyState, type OrgContext } from "@/components/OrgPage";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/templates/")({
  head: () => ({ meta: [{ title: "Mallar — Checklista" }] }),
  component: () => <OrgPage>{(ctx) => <Templates ctx={ctx} />}</OrgPage>,
});

function Templates({ ctx }: { ctx: OrgContext }) {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "" });
  const manage = canManage(ctx.role);

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

  const all = templates.data ?? [];
  const activeCount = all.filter((x) => x.status === "active").length;
  const max = PLANS[ctx.organization.plan].maxTemplates;
  const atLimit = max !== null && activeCount >= max;
  const shown = all.filter((x) => x.status === tab);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { data: tpl, error } = await supabase
      .from("templates")
      .insert({ org_id: ctx.orgId, ...form, created_by: ctx.userId })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    await supabase
      .from("template_versions")
      .insert({ template_id: tpl.id, org_id: ctx.orgId, version: 1, created_by: ctx.userId });
    await logAudit(ctx.orgId, ctx.userId, "template.created", "template", tpl.id, { title: tpl.title });
    setOpen(false);
    navigate({ to: "/templates/$templateId", params: { templateId: tpl.id } });
  }

  async function duplicate(id: string) {
    if (atLimit) { toast.error(t("limit.templates", { max: max ?? 0 })); return; }
    const src = all.find((x) => x.id === id)!;
    const { data: ver } = await supabase
      .from("template_versions")
      .select("id")
      .eq("template_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .single();
    const { data: tpl, error } = await supabase
      .from("templates")
      .insert({
        org_id: ctx.orgId,
        title: `${src.title} (kopia)`,
        description: src.description,
        category: src.category,
        created_by: ctx.userId,
      })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    const { data: newVer } = await supabase
      .from("template_versions")
      .insert({ template_id: tpl.id, org_id: ctx.orgId, version: 1, created_by: ctx.userId })
      .select()
      .single();
    if (ver && newVer) {
      const { data: items } = await supabase.from("template_items").select("*").eq("version_id", ver.id);
      if (items?.length) {
        await supabase.from("template_items").insert(
          items.map(({ id: _id, version_id: _v, ...rest }) => ({ ...rest, version_id: newVer.id })),
        );
      }
    }
    await logAudit(ctx.orgId, ctx.userId, "template.duplicated", "template", tpl.id, { from: src.title });
    qc.invalidateQueries({ queryKey: ["templates", ctx.orgId] });
  }

  async function setStatus(id: string, status: "active" | "archived") {
    if (status === "active" && atLimit) { toast.error(t("limit.templates", { max: max ?? 0 })); return; }
    const { error } = await supabase.from("templates").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (status === "archived") await logAudit(ctx.orgId, ctx.userId, "template.archived", "template", id);
    qc.invalidateQueries({ queryKey: ["templates", ctx.orgId] });
  }

  return (
    <>
      <PageHeader
        title={t("templates.title")}
        action={
          manage ? (
            <Button onClick={() => (atLimit ? toast.error(t("limit.templates", { max: max ?? 0 })) : setOpen(true))}>
              <Plus className="size-4" /> {t("templates.new")}
            </Button>
          ) : null
        }
      />

      {manage && atLimit && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          {t("limit.templates", { max: max ?? 0 })}
          <Button asChild size="sm" variant="outline">
            <Link to="/billing">{t("limit.upgradeCta")}</Link>
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="active">{t("templates.activeOnes")}</TabsTrigger>
          <TabsTrigger value="archived">{t("templates.archived")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {templates.isPending ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState>{t("templates.empty")}</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((tpl) => (
            <div key={tpl.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <Link
                  to="/templates/$templateId"
                  params={{ templateId: tpl.id }}
                  className="font-semibold hover:text-primary"
                >
                  {tpl.title}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">v{tpl.current_version}</span>
              </div>
              {tpl.category && <p className="mt-1 text-xs font-medium text-primary">{tpl.category}</p>}
              <p className="mt-2 line-clamp-2 flex-1 text-sm text-muted-foreground">{tpl.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {tpl.status === "active" && (
                  <Button asChild size="sm">
                    <Link to="/runs/new" search={{ template: tpl.id }}>
                      {t("run.start")}
                    </Link>
                  </Button>
                )}
                {manage && (
                  <>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/templates/$templateId" params={{ templateId: tpl.id }}>
                        <Pencil className="size-4" /> {t("common.edit")}
                      </Link>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => duplicate(tpl.id)}>
                      <Copy className="size-4" /> {t("common.duplicate")}
                    </Button>
                    {tpl.status === "active" ? (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(tpl.id, "archived")}>
                        <Archive className="size-4" /> {t("common.archive")}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(tpl.id, "active")}>
                        <RotateCcw className="size-4" /> {t("common.restore")}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={create} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("templates.new")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="title">{t("templates.label")}</Label>
              <Input
                id="title"
                required
                placeholder={t("templates.namePlaceholder")}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat">{t("templates.category")}</Label>
              <Input id="cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">{t("templates.description")}</Label>
              <Textarea
                id="desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("common.create")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
