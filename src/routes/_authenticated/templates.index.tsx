import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Archive, Copy, ListChecks, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";
import { canManage, logAudit } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { pickItems } from "@/lib/items";
import { Checkbox } from "@/components/ui/checkbox";
import { OrgPage, Spinner, EmptyState, type OrgContext } from "@/components/OrgPage";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DELETE_GRACE_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export const Route = createFileRoute("/_authenticated/templates/")({
  head: () => ({ meta: [{ title: "Administrera checklistor — Checklista" }] }),
  component: () => <OrgPage>{(ctx) => <Templates ctx={ctx} />}</OrgPage>,
});

function Templates({ ctx }: { ctx: OrgContext }) {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "archived" | "trash">("active");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "" });
  // Base checklist questions to include in the new checklist.
  const [baseKeep, setBaseKeep] = useState<Set<string>>(new Set());
  // Checklists awaiting confirmation for permanent deletion.
  const [purgeIds, setPurgeIds] = useState<string[] | null>(null);
  const manage = canManage(ctx.role);

  const templates = useQuery({
    queryKey: ["templates", ctx.orgId],
    queryFn: async () => {
      // Permanently remove templates whose deletion grace period has passed.
      await supabase.rpc("purge_expired_templates");
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .eq("org_id", ctx.orgId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const now = Date.now();
      return data.filter((x) => !x.delete_after || new Date(x.delete_after).getTime() > now);
    },
  });

  const all = (templates.data ?? []).filter((x) => !x.is_base);
  const base = templates.data?.find((x) => x.is_base);
  const trash = all.filter((x) => x.delete_after);
  const activeCount = all.filter((x) => x.status === "active" && !x.delete_after).length;
  const max = PLANS[ctx.organization.plan].maxTemplates;
  const atLimit = max !== null && activeCount >= max;
  const shown = tab === "trash" ? trash : all.filter((x) => !x.delete_after && x.status === tab);

  const baseItems = useQuery({
    queryKey: ["template-items", base?.id],
    enabled: !!base,
    queryFn: async () => latestItems(base!.id),
  });

  async function latestItems(templateId: string) {
    const { data: ver } = await supabase
      .from("template_versions")
      .select("id")
      .eq("template_id", templateId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ver) return [];
    const { data, error } = await supabase.from("template_items").select("*").eq("version_id", ver.id);
    if (error) throw error;
    return data;
  }

  async function createBase() {
    const { data: tpl, error } = await supabase
      .from("templates")
      .insert({ org_id: ctx.orgId, title: t("templates.base"), is_base: true, created_by: ctx.userId })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    await supabase
      .from("template_versions")
      .insert({ template_id: tpl.id, org_id: ctx.orgId, version: 1, created_by: ctx.userId });
    await logAudit(ctx.orgId, ctx.userId, "template.base_created", "template", tpl.id);
    navigate({ to: "/templates/$templateId", params: { templateId: tpl.id } });
  }

  function openCreate() {
    setBaseKeep(new Set((baseItems.data ?? []).map((i) => i.id)));
    setOpen(true);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { data: tpl, error } = await supabase
      .from("templates")
      .insert({ org_id: ctx.orgId, ...form, created_by: ctx.userId })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    const { data: ver } = await supabase
      .from("template_versions")
      .insert({ template_id: tpl.id, org_id: ctx.orgId, version: 1, created_by: ctx.userId })
      .select()
      .single();
    // Start the new checklist with the chosen questions from the base checklist.
    if (base && ver && baseKeep.size) {
      const items = pickItems(await latestItems(base.id), baseKeep);
      if (items.length) {
        await supabase.from("template_items").insert(
          items.map(({ id: _id, version_id: _v, ...rest }) => ({ ...rest, version_id: ver.id })),
        );
      }
    }
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
    const { error } = await supabase
      .from("templates")
      .update(status === "active" ? { status, delete_after: null } : { status })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (status === "archived") await logAudit(ctx.orgId, ctx.userId, "template.archived", "template", id);
    qc.invalidateQueries({ queryKey: ["templates", ctx.orgId] });
  }

  async function moveToTrash(id: string) {
    const deleteAfter = new Date(Date.now() + DELETE_GRACE_DAYS * DAY_MS).toISOString();
    const { error } = await supabase
      .from("templates")
      .update({ status: "archived", delete_after: deleteAfter })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit(ctx.orgId, ctx.userId, "template.trashed", "template", id, { delete_after: deleteAfter });
    toast.success(t("templates.trashed"));
    qc.invalidateQueries({ queryKey: ["templates", ctx.orgId] });
  }

  async function restoreFromTrash(id: string) {
    // Back to active when the plan allows it, otherwise to archived.
    const status = atLimit ? "archived" : "active";
    const { error } = await supabase.from("templates").update({ status, delete_after: null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit(ctx.orgId, ctx.userId, "template.restored", "template", id);
    toast.success(t(status === "active" ? "templates.restored" : "templates.restoredArchived"));
    qc.invalidateQueries({ queryKey: ["templates", ctx.orgId] });
  }

  async function purge(ids: string[]) {
    const { error } = await supabase.from("templates").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    for (const id of ids) await logAudit(ctx.orgId, ctx.userId, "template.deleted", "template", id);
    toast.success(t("templates.purged", { count: ids.length }));
    qc.invalidateQueries({ queryKey: ["templates", ctx.orgId] });
  }

  function deleteLabel(deleteAfter: string) {
    const days = Math.ceil((new Date(deleteAfter).getTime() - Date.now()) / DAY_MS);
    return days <= 1 ? t("templates.deleteToday") : t("templates.deletePending", { days });
  }

  return (
    <>
      <PageHeader
        title={t("templates.title")}
        action={
          manage ? (
            <Button onClick={() => (atLimit ? toast.error(t("limit.templates", { max: max ?? 0 })) : openCreate())}>
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

      {manage && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <ListChecks className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">
                {t("templates.base")}
                {base && baseItems.data && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {t("templates.baseItems", { count: baseItems.data.length })}
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{t("templates.baseDesc")}</p>
            </div>
          </div>
          {base ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/templates/$templateId" params={{ templateId: base.id }}>
                <Pencil className="size-4" /> {t("common.edit")}
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={createBase}>
              <Plus className="size-4" /> {t("templates.baseCreate")}
            </Button>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="active">{t("templates.activeOnes")}</TabsTrigger>
          <TabsTrigger value="archived">{t("templates.archived")}</TabsTrigger>
          <TabsTrigger value="trash" className="gap-1.5">
            <Trash2 className="size-3.5" /> {t("templates.trash")}
            {trash.length > 0 && (
              <span className="rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-4 text-destructive-foreground">
                {trash.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "trash" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          {t("templates.trashHint")}
          {manage && trash.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setPurgeIds(trash.map((x) => x.id))}
            >
              <Trash2 className="size-4" /> {t("templates.emptyTrash")}
            </Button>
          )}
        </div>
      )}

      {templates.isPending ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState>{t(tab === "trash" ? "templates.trashEmpty" : "templates.empty")}</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((tpl) => (
            <div key={tpl.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                {tpl.delete_after ? (
                  <span className="font-semibold">{tpl.title}</span>
                ) : (
                  <Link
                    to="/templates/$templateId"
                    params={{ templateId: tpl.id }}
                    className="font-semibold hover:text-primary"
                  >
                    {tpl.title}
                  </Link>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">v{tpl.current_version}</span>
              </div>
              {tpl.category && <p className="mt-1 text-xs font-medium text-primary">{tpl.category}</p>}
              {tpl.delete_after && (
                <p className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  <Trash2 className="size-3" /> {deleteLabel(tpl.delete_after)}
                </p>
              )}
              <p className="mt-2 line-clamp-2 flex-1 text-sm text-muted-foreground">{tpl.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {tpl.delete_after ? (
                  manage && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => restoreFromTrash(tpl.id)}>
                        <RotateCcw className="size-4" /> {t("common.restore")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setPurgeIds([tpl.id])}
                      >
                        <Trash2 className="size-4" /> {t("templates.deleteNow")}
                      </Button>
                    </>
                  )
                ) : (
                  <>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => moveToTrash(tpl.id)}
                        >
                          <Trash2 className="size-4" /> {t("common.delete")}
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={purgeIds !== null} onOpenChange={(o) => !o && setPurgeIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("templates.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {purgeIds?.length === 1
                ? t("templates.deleteBodyOne")
                : t("templates.deleteBodyMany", { count: purgeIds?.length ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (purgeIds) purge(purgeIds);
                setPurgeIds(null);
              }}
            >
              {t("templates.deleteNow")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            {base && !!baseItems.data?.length && (
              <BasePicker
                items={baseItems.data}
                keep={baseKeep}
                onChange={setBaseKeep}
              />
            )}
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

// Choose which base checklist questions a new checklist starts with.
function BasePicker({
  items,
  keep,
  onChange,
}: {
  items: { id: string; label: string; position: number }[];
  keep: Set<string>;
  onChange: (keep: Set<string>) => void;
}) {
  const t = useT();
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const allOn = keep.size === items.length;
  const toggle = (id: string, on: boolean) => {
    const next = new Set(keep);
    if (on) next.add(id);
    else next.delete(id);
    onChange(next);
  };
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={allOn ? true : keep.size ? "indeterminate" : false}
          onCheckedChange={() => onChange(allOn ? new Set() : new Set(items.map((i) => i.id)))}
        />
        {t("templates.baseInclude", { count: keep.size, total: items.length })}
      </label>
      <ul className="max-h-48 space-y-1.5 overflow-y-auto pl-6">
        {sorted.map((i) => (
          <li key={i.id}>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={keep.has(i.id)} onCheckedChange={(v) => toggle(i.id, v === true)} />
              {i.label}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
