import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Archive, BookOpen, Copy, Folder, FolderOpen, FolderPlus, Inbox, ListChecks, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";
import { canManage, logAudit } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { concatItems, folderOf, pickItems } from "@/lib/items";
import { currentVersionId } from "@/lib/versions";
import { LIBRARY, libraryRows, type LibraryTemplate } from "@/lib/library";
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
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", category: "" });
  // Base checklist questions to include in the new checklist.
  const [baseKeep, setBaseKeep] = useState<Set<string>>(new Set());
  // Checklists awaiting confirmation for permanent deletion.
  const [purgeIds, setPurgeIds] = useState<string[] | null>(null);
  // Selected folder: ALL, NONE (no category) or a category name.
  const [folder, setFolder] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  // Folders created in this visit that have no checklists yet.
  const [newFolders, setNewFolders] = useState<string[]>([]);
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
  const bases = (templates.data ?? []).filter((x) => x.is_base);
  const baseFor = (category: string) => bases.find((b) => folderOf(b.category) === category);
  const folders = [...new Set([...all, ...bases].map((x) => folderOf(x.category)).filter(Boolean).concat(newFolders))].sort(
    (a, b) => a.localeCompare(b, "sv"),
  );
  const trash = all.filter((x) => x.delete_after);
  const activeCount = all.filter((x) => x.status === "active" && !x.delete_after).length;
  const max = PLANS[ctx.organization.plan].maxTemplates;
  const atLimit = max !== null && activeCount >= max;
  const inTab = tab === "trash" ? trash : all.filter((x) => !x.delete_after && x.status === tab);
  const inFolder = (x: { category: string | null }) =>
    folder === ALL || (folder === NONE ? !folderOf(x.category) : folderOf(x.category) === folder);
  const query = search.trim().toLowerCase();
  const matches = (x: { title: string; description: string | null; category: string | null }) =>
    !query || [x.title, x.description, x.category].some((v) => v?.toLowerCase().includes(query));
  // Searching looks in every folder, so a checklist is found wherever it lives.
  const shown = inTab.filter((x) => (query ? true : inFolder(x)) && matches(x));
  const countIn = (f: string) =>
    inTab.filter((x) => (f === ALL ? true : f === NONE ? !folderOf(x.category) : folderOf(x.category) === f)).length;

  // Items of every base checklist, keyed by base id.
  const baseItems = useQuery({
    queryKey: ["base-items", bases.map((b) => `${b.id}:${b.current_version}`).join(",")],
    enabled: bases.length > 0,
    queryFn: async () =>
      Object.fromEntries(await Promise.all(bases.map(async (b) => [b.id, await latestItems(b)] as const))),
  });
  // Base checklists that apply to a new checklist in `category`: the general one, then the folder's own.
  const basesFor = (category: string) =>
    [baseFor(""), category ? baseFor(category) : undefined].filter((b): b is NonNullable<typeof b> => !!b);

  async function latestItems(tpl: { id: string; current_version: number }) {
    const verId = await currentVersionId(tpl.id, tpl.current_version);
    if (!verId) return [];
    const { data, error } = await supabase.from("template_items").select("*").eq("version_id", verId);
    if (error) throw error;
    return data;
  }

  async function createBase(category: string) {
    const { data: tpl, error } = await supabase
      .from("templates")
      .insert({
        org_id: ctx.orgId,
        title: category ? `${t("templates.base")} – ${category}` : t("templates.base"),
        category: category || null,
        is_base: true,
        created_by: ctx.userId,
      })
      .select()
      .single();
    if (error) {
      // Before the per-category migration only one base checklist is allowed.
      toast.error(error.code === "23505" ? t("templates.baseNeedsMigration") : error.message);
      return;
    }
    await supabase
      .from("template_versions")
      .insert({ template_id: tpl.id, org_id: ctx.orgId, version: 1, created_by: ctx.userId });
    await logAudit(ctx.orgId, ctx.userId, "template.base_created", "template", tpl.id);
    navigate({ to: "/templates/$templateId", params: { templateId: tpl.id } });
  }

  const keepAllFor = (category: string) =>
    new Set(basesFor(category).flatMap((b) => (baseItems.data?.[b.id] ?? []).map((i) => i.id)));

  function openCreate() {
    const category = folder === ALL || folder === NONE ? "" : folder;
    setForm({ title: "", description: "", category });
    setBaseKeep(keepAllFor(category));
    setOpen(true);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { data: tpl, error } = await supabase
      .from("templates")
      .insert({ org_id: ctx.orgId, ...form, category: folderOf(form.category) || null, created_by: ctx.userId })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    const { data: ver } = await supabase
      .from("template_versions")
      .insert({ template_id: tpl.id, org_id: ctx.orgId, version: 1, created_by: ctx.userId })
      .select()
      .single();
    // Start the new checklist with the chosen questions from its base checklists.
    if (ver && baseKeep.size) {
      let items: Awaited<ReturnType<typeof latestItems>> = [];
      for (const b of basesFor(folderOf(form.category))) items = concatItems(items, pickItems(await latestItems(b), baseKeep));
      if (items.length) {
        // Copies get their own keys and remember the base question they came from.
        await supabase.from("template_items").insert(
          items.map(({ id: _id, version_id: _v, item_key, base_key: _b, ...rest }) => ({
            ...rest,
            ...(item_key ? { base_key: item_key } : {}),
            version_id: ver.id,
          })),
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
    const verId = await currentVersionId(id, src.current_version);
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
    if (verId && newVer) {
      const { data: items } = await supabase.from("template_items").select("*").eq("version_id", verId);
      if (items?.length) {
        await supabase.from("template_items").insert(
          items.map(({ id: _id, version_id: _v, item_key: _k, ...rest }) => ({ ...rest, version_id: newVer.id })),
        );
      }
    }
    await logAudit(ctx.orgId, ctx.userId, "template.duplicated", "template", tpl.id, { from: src.title });
    qc.invalidateQueries({ queryKey: ["templates", ctx.orgId] });
  }

  /** Adds a built-in checklist from the library to this organization. */
  async function addFromLibrary(lib: LibraryTemplate) {
    if (atLimit) { toast.error(t("limit.templates", { max: max ?? 0 })); return; }
    setAdding(lib.key);
    try {
      const { data: tpl, error } = await supabase
        .from("templates")
        .insert({
          org_id: ctx.orgId,
          title: lib.title,
          description: lib.description,
          category: lib.category,
          created_by: ctx.userId,
        })
        .select()
        .single();
      if (error) throw error;
      const { data: ver, error: e2 } = await supabase
        .from("template_versions")
        .insert({ template_id: tpl.id, org_id: ctx.orgId, version: 1, created_by: ctx.userId })
        .select()
        .single();
      if (e2) throw e2;
      const { error: e3 } = await supabase
        .from("template_items")
        .insert(libraryRows(lib).map((r) => ({ ...r, version_id: ver.id, org_id: ctx.orgId })));
      if (e3) throw e3;
      await logAudit(ctx.orgId, ctx.userId, "template.created", "template", tpl.id, { title: tpl.title, library: lib.key });
      toast.success(t("templates.libraryAdded", { title: lib.title }));
      setLibraryOpen(false);
      qc.invalidateQueries({ queryKey: ["templates", ctx.orgId] });
      navigate({ to: "/templates/$templateId", params: { templateId: tpl.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(null);
    }
  }

  // Checklist being dragged onto a folder in the sidebar.
  const [dragTpl, setDragTpl] = useState<string | null>(null);
  const [overFolder, setOverFolder] = useState<string | null>(null);

  async function moveToFolder(id: string, target: string) {
    const category = target === NONE ? null : target;
    const tpl = all.find((x) => x.id === id);
    if (!tpl || folderOf(tpl.category) === folderOf(category)) return;
    const { error } = await supabase.from("templates").update({ category }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit(ctx.orgId, ctx.userId, "template.moved", "template", id, { folder: category });
    toast.success(category ? t("templates.movedTo", { folder: category }) : t("templates.movedOut"));
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
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setLibraryOpen(true)}>
                <BookOpen className="size-4" /> {t("templates.library")}
              </Button>
              <Button onClick={() => (atLimit ? toast.error(t("limit.templates", { max: max ?? 0 })) : openCreate())}>
                <Plus className="size-4" /> {t("templates.new")}
              </Button>
            </div>
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

      <div className="grid gap-6 md:grid-cols-[15rem_1fr]">
        <aside className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={t("templates.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <nav className="space-y-0.5" aria-label={t("templates.folders")}>
            <FolderButton icon={<ListChecks className="size-4" />} label={t("templates.allFolders")} count={countIn(ALL)} active={folder === ALL} onClick={() => setFolder(ALL)} />
            {folders.map((f) => (
              <FolderButton
                key={f}
                icon={folder === f ? <FolderOpen className="size-4" /> : <Folder className="size-4" />}
                label={f}
                count={countIn(f)}
                active={folder === f}
                onClick={() => setFolder(f)}
                dropping={overFolder === f}
                onDragOver={dragTpl ? () => setOverFolder(f) : undefined}
                onDragLeave={() => setOverFolder((o) => (o === f ? null : o))}
                onDrop={() => dragTpl && moveToFolder(dragTpl, f)}
              />
            ))}
            {(countIn(NONE) > 0 || dragTpl) && (
              <FolderButton
                icon={<Inbox className="size-4" />}
                label={t("templates.noFolder")}
                count={countIn(NONE)}
                active={folder === NONE}
                onClick={() => setFolder(NONE)}
                dropping={overFolder === NONE}
                onDragOver={dragTpl ? () => setOverFolder(NONE) : undefined}
                onDragLeave={() => setOverFolder((o) => (o === NONE ? null : o))}
                onDrop={() => dragTpl && moveToFolder(dragTpl, NONE)}
              />
            )}
            {dragTpl && <p className="px-2.5 pt-1 text-xs text-muted-foreground">{t("templates.dropOnFolder")}</p>}
          </nav>
          {manage && (
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={() => {
                const name = window.prompt(t("templates.newFolderPrompt"))?.trim();
                if (!name) return;
                if (!folders.includes(name)) setNewFolders((l) => [...l, name]);
                setFolder(name);
              }}
            >
              <FolderPlus className="size-4" /> {t("templates.newFolder")}
            </Button>
          )}
        </aside>

        <div className="min-w-0">
      {manage && !query && (
        <div className="mb-6 space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <ListChecks className="size-5 text-primary" /> {t("templates.base")}
          </p>
          <p className="text-sm text-muted-foreground">{t("templates.baseDesc")}</p>
          <ul className="space-y-1.5">
            {(folder === ALL ? ["", ...folders] : folder === NONE ? [""] : ["", folder]).map((f) => {
              const b = baseFor(f);
              const n = b ? baseItems.data?.[b.id]?.length : undefined;
              return (
                <li key={f || "general"} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-sm">
                  <span>
                    {f ? t("templates.baseForFolder", { folder: f }) : t("templates.baseGeneral")}
                    {n !== undefined && <span className="ml-2 text-xs text-muted-foreground">{t("templates.baseItems", { count: n })}</span>}
                  </span>
                  {b ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/templates/$templateId" params={{ templateId: b.id }}>
                        <Pencil className="size-4" /> {t("common.edit")}
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => createBase(f)}>
                      <Plus className="size-4" /> {t("templates.baseCreate")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
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
            <div
              key={tpl.id}
              draggable={manage && !tpl.delete_after}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", tpl.id);
                setDragTpl(tpl.id);
              }}
              onDragEnd={() => {
                setDragTpl(null);
                setOverFolder(null);
              }}
              className={cn(
                "flex flex-col rounded-xl border bg-card p-5 shadow-soft transition-shadow hover:shadow-lift",
                manage && !tpl.delete_after && "cursor-grab active:cursor-grabbing",
                dragTpl === tpl.id && "opacity-50",
              )}
            >
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
              {manage && !tpl.delete_after ? (
                <label className="mt-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-primary">
                  <Folder className="size-3" />
                  <select
                    aria-label={t("templates.moveToFolder")}
                    className="cursor-pointer appearance-none bg-transparent pr-3 text-xs font-medium text-primary outline-none hover:underline"
                    value={folderOf(tpl.category) || NONE}
                    onChange={(e) => {
                      if (e.target.value === NEW_FOLDER) {
                        const name = window.prompt(t("templates.newFolderPrompt"))?.trim();
                        if (name) moveToFolder(tpl.id, name);
                      } else moveToFolder(tpl.id, e.target.value);
                    }}
                  >
                    <option value={NONE}>{t("templates.noFolder")}</option>
                    {folders.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                    <option value={NEW_FOLDER}>{t("templates.newFolder")}…</option>
                  </select>
                </label>
              ) : (
                tpl.category && <p className="mt-1 text-xs font-medium text-primary">{tpl.category}</p>
              )}
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
        </div>
      </div>

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
              <Input
                id="cat"
                list="folder-list"
                placeholder={t("templates.folderPlaceholder")}
                value={form.category}
                onChange={(e) => {
                  setForm({ ...form, category: e.target.value });
                  setBaseKeep(keepAllFor(folderOf(e.target.value)));
                }}
              />
              <datalist id="folder-list">
                {folders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">{t("templates.description")}</Label>
              <Textarea
                id="desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            {(() => {
              const groups = basesFor(folderOf(form.category))
                .map((b) => ({
                  title: folderOf(b.category) ? t("templates.baseForFolder", { folder: folderOf(b.category) }) : t("templates.baseGeneral"),
                  items: baseItems.data?.[b.id] ?? [],
                }))
                .filter((g) => g.items.length);
              return groups.length ? <BasePicker groups={groups} keep={baseKeep} onChange={setBaseKeep} /> : null;
            })()}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("common.create")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("templates.library")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("templates.libraryHint")}</p>
          <div className="space-y-3">
            {LIBRARY.map((lib) => {
              const exists = all.some((x) => x.title === lib.title && !x.delete_after);
              return (
                <div key={lib.key} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{lib.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{lib.description}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {t("templates.libraryMeta", { folder: lib.category, count: lib.items.length })}
                      </div>
                    </div>
                    <Button size="sm" disabled={adding !== null} onClick={() => addFromLibrary(lib)}>
                      {adding === lib.key ? t("common.loading") : exists ? t("templates.libraryAddAgain") : t("templates.libraryAdd")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const ALL = "\u0000all";
const NONE = "\u0000none";
const NEW_FOLDER = "\u0000new";

function FolderButton({
  icon,
  label,
  count,
  active,
  onClick,
  dropping,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dropping?: boolean;
  onDragOver?: (() => void) | undefined;
  onDragLeave?: () => void;
  onDrop?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      onDragOver={
        onDragOver
          ? (e) => {
              e.preventDefault();
              onDragOver();
            }
          : undefined
      }
      onDragLeave={onDragLeave}
      onDrop={
        onDrop
          ? (e) => {
              e.preventDefault();
              onDrop();
            }
          : undefined
      }
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
        active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        dropping && "ring-2 ring-primary bg-primary/10",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs tabular-nums">{count}</span>
    </button>
  );
}

// Choose which base checklist questions a new checklist starts with.
function BasePicker({
  groups,
  keep,
  onChange,
}: {
  groups: { title: string; items: { id: string; label: string; position: number }[] }[];
  keep: Set<string>;
  onChange: (keep: Set<string>) => void;
}) {
  const t = useT();
  const items = groups.flatMap((g) => g.items);
  const allOn = items.every((i) => keep.has(i.id));
  const chosen = items.filter((i) => keep.has(i.id)).length;
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
          checked={allOn ? true : chosen ? "indeterminate" : false}
          onCheckedChange={() => onChange(allOn ? new Set() : new Set(items.map((i) => i.id)))}
        />
        {t("templates.baseInclude", { count: chosen, total: items.length })}
      </label>
      <div className="max-h-56 space-y-3 overflow-y-auto pl-6">
        {groups.map((g) => (
          <div key={g.title}>
            {groups.length > 1 && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>}
            <ul className="space-y-1.5">
              {[...g.items]
                .sort((a, b) => a.position - b.position)
                .map((i) => (
                  <li key={i.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={keep.has(i.id)} onCheckedChange={(v) => toggle(i.id, v === true)} />
                      {i.label}
                    </label>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
