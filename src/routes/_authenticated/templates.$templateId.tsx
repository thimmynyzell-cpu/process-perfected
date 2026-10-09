import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, GitBranch, Network, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FlowTree } from "@/components/FlowTree";
import { branchValues, type FlowNode } from "@/lib/flow";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useT } from "@/i18n";
import { canManage, logAudit } from "@/lib/auth";
import { OrgPage, Spinner, nativeSelect, type OrgContext } from "@/components/OrgPage";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type ItemType = Database["public"]["Enums"]["item_type"];
type DraftItem = {
  key: string;
  section: string;
  type: ItemType;
  label: string;
  help_text: string;
  required: boolean;
  allow_note: boolean;
  allow_photo: boolean;
  options: string;
  parent: string;
  show_when: string;
};

const optList = (s: string) => s.split("\n").map((o) => o.trim()).filter(Boolean);

export const Route = createFileRoute("/_authenticated/templates/$templateId")({
  head: () => ({ meta: [{ title: "Redigera mall — Checklista" }] }),
  component: () => <OrgPage>{(ctx) => <Editor ctx={ctx} />}</OrgPage>,
});

function Editor({ ctx }: { ctx: OrgContext }) {
  const t = useT();
  const qc = useQueryClient();
  const { templateId } = Route.useParams();
  const manage = canManage(ctx.role);

  const query = useQuery({
    queryKey: ["template", templateId],
    queryFn: async () => {
      const { data: tpl, error } = await supabase.from("templates").select("*").eq("id", templateId).single();
      if (error) throw error;
      const { data: ver } = await supabase
        .from("template_versions")
        .select("id, version")
        .eq("template_id", templateId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: items } = ver
        ? await supabase.from("template_items").select("*").eq("version_id", ver.id).order("position")
        : { data: [] };
      return { tpl, items: items ?? [] };
    },
  });

  const [meta, setMeta] = useState({ title: "", description: "", category: "" });
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  const jumpToItem = (key: string) => {
    setFlowOpen(false);
    setHighlightKey(key);
    requestAnimationFrame(() => {
      itemRefs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  useEffect(() => {
    if (!highlightKey) return;
    const timer = setTimeout(() => setHighlightKey(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightKey]);

  useEffect(() => {
    if (!query.data) return;
    const { tpl, items } = query.data;
    setMeta({ title: tpl.title, description: tpl.description ?? "", category: tpl.category ?? "" });
    const posKey = new Map(items.map((i) => [i.position, i.id]));
    setItems(
      items.map((i) => ({
        parent: i.parent_position != null ? (posKey.get(i.parent_position) ?? "") : "",
        show_when: i.show_when ?? "",
        key: i.id,
        section: i.section ?? "",
        type: i.type,
        label: i.label,
        help_text: i.help_text ?? "",
        required: i.required,
        allow_note: i.allow_note,
        allow_photo: i.allow_photo,
        options: Array.isArray(i.options) ? (i.options as string[]).join("\n") : "",
      })),
    );
  }, [query.data]);

  if (query.isPending) return <Spinner />;
  if (query.error || !query.data) return <p className="text-muted-foreground">{t("error.generic")}</p>;

  const flowNodes: FlowNode[] = items.map((i) => ({
    key: i.key,
    label: i.label,
    type: i.type,
    required: i.required,
    options: optList(i.options),
    parentKey: i.parent && i.show_when ? i.parent : null,
    showWhen: i.parent && i.show_when ? i.show_when : null,
  }));
  const yesNo = (v: string) => (v === "true" ? t("flow.yes") : v === "false" ? t("flow.no") : v);

  const update = (idx: number, patch: Partial<DraftItem>) =>
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const move = (idx: number, dir: -1 | 1) =>
    setItems((list) => {
      const next = [...list];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return list;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  const add = () =>
    setItems((list) => [
      ...list,
      {
        key: crypto.randomUUID(),
        section: list.at(-1)?.section ?? "",
        type: "checkbox",
        label: "",
        help_text: "",
        required: false,
        allow_note: false,
        allow_photo: false,
        options: "",
        parent: "",
        show_when: "",
      },
    ]);

  async function save() {
    if (!meta.title.trim()) return;
    setSaving(true);
    try {
      const tpl = query.data!.tpl;
      const nextVersion = tpl.current_version + 1;
      const { data: ver, error } = await supabase
        .from("template_versions")
        .insert({ template_id: tpl.id, org_id: ctx.orgId, version: nextVersion, created_by: ctx.userId })
        .select()
        .single();
      if (error) throw error;
      const kept = items.filter((i) => i.label.trim());
      const keyPos = new Map(kept.map((i, idx) => [i.key, idx]));
      const rows = kept
        .map((i, position) => ({
          parent_position: i.parent && i.show_when && keyPos.has(i.parent) ? keyPos.get(i.parent)! : null,
          show_when: i.parent && i.show_when && keyPos.has(i.parent) ? i.show_when : null,
          version_id: ver.id,
          org_id: ctx.orgId,
          position,
          section: i.section.trim() || null,
          type: i.type,
          label: i.label.trim(),
          help_text: i.help_text.trim() || null,
          required: i.required,
          allow_note: i.allow_note,
          allow_photo: i.allow_photo,
          options:
            i.type === "dropdown" ? optList(i.options) : [],
        }));
      if (rows.length) {
        const { error: e2 } = await supabase.from("template_items").insert(rows);
        if (e2) throw e2;
      }
      const { error: e3 } = await supabase
        .from("templates")
        .update({
          title: meta.title.trim(),
          description: meta.description || null,
          category: meta.category || null,
          current_version: nextVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tpl.id);
      if (e3) throw e3;
      await logAudit(ctx.orgId, ctx.userId, "template.updated", "template", tpl.id, {
        title: meta.title,
        version: nextVersion,
      });
      toast.success(t("templates.saved"));
      qc.invalidateQueries({ queryKey: ["template", templateId] });
      qc.invalidateQueries({ queryKey: ["templates", ctx.orgId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error.generic"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Link to="/templates" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("common.back")}
      </Link>
      <PageHeader
        title={manage ? t("templates.editor") : meta.title}
        description={`${t("templates.version")} ${query.data.tpl.current_version}`}
        action={
          <div className="flex gap-2">
            <Dialog open={flowOpen} onOpenChange={setFlowOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Network className="size-4" /> {t("flow.show")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t("flow.title")}</DialogTitle>
                  <DialogDescription>{t("flow.desc")}</DialogDescription>
                </DialogHeader>
                <FlowTree nodes={flowNodes} onSelect={jumpToItem} />
              </DialogContent>
            </Dialog>
            {manage && (
              <Button onClick={save} disabled={saving}>
                {t("templates.saveNewVersion")}
              </Button>
            )}
          </div>
        }
      />
      {!manage && <p className="mb-4 text-sm text-muted-foreground">{t("templates.readOnly")}</p>}

      <fieldset disabled={!manage} className="space-y-6">
        <div className="grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t("templates.label")}</Label>
            <Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("templates.category")}</Label>
            <Input value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("templates.description")}</Label>
            <Input value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{t("templates.versionNote")}</p>

        {items.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t("templates.noItems")}
          </div>
        )}

        <ol className="space-y-3">
          {items.map((item, idx) => (
            <li
              key={item.key}
              ref={(el) => {
                if (el) itemRefs.current.set(item.key, el);
                else itemRefs.current.delete(item.key);
              }}
              className={cn(
                "rounded-xl border bg-card p-4 shadow-soft transition-all",
                highlightKey === item.key && "border-primary ring-2 ring-primary/40",
              )}
            >
              <div className="flex items-start gap-3">
                <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {idx + 1}
                </span>
                <div className="grid flex-1 gap-3 md:grid-cols-[1fr_10rem_10rem]">
                  <Input
                    placeholder={t("templates.label")}
                    value={item.label}
                    onChange={(e) => update(idx, { label: e.target.value })}
                  />
                  <Input
                    placeholder={t("templates.section")}
                    value={item.section}
                    onChange={(e) => update(idx, { section: e.target.value })}
                  />
                  <select
                    className={nativeSelect}
                    value={item.type}
                    onChange={(e) => update(idx, { type: e.target.value as ItemType })}
                  >
                    {(["checkbox", "text", "number", "dropdown"] as const).map((type) => (
                      <option key={type} value={type}>
                        {t(`itemType.${type}`)}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="md:col-span-3"
                    placeholder={`${t("templates.helpText")} (${t("common.optional")})`}
                    value={item.help_text}
                    onChange={(e) => update(idx, { help_text: e.target.value })}
                  />
                  {item.type === "dropdown" && (
                    <Textarea
                      className="md:col-span-3"
                      placeholder={t("templates.options")}
                      value={item.options}
                      onChange={(e) => update(idx, { options: e.target.value })}
                    />
                  )}
                  {(() => {
                    const parents = items.slice(0, idx).filter((p) => p.type === "checkbox" || p.type === "dropdown");
                    const parent = parents.find((p) => p.key === item.parent);
                    const vals = parent ? branchValues(parent.type, optList(parent.options)) : [];
                    return (
                      <div className="flex flex-wrap items-center gap-2 text-sm md:col-span-3">
                        <GitBranch className="size-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{t("flow.showIf")}</span>
                        <select
                          className={nativeSelect + " w-auto max-w-xs"}
                          value={parent ? item.parent : ""}
                          onChange={(e) => {
                            const p = parents.find((x) => x.key === e.target.value);
                            update(idx, {
                              parent: e.target.value,
                              show_when: p ? (branchValues(p.type, optList(p.options))[0] ?? "") : "",
                            });
                          }}
                        >
                          <option value="">{t("flow.always")}</option>
                          {parents.map((p) => (
                            <option key={p.key} value={p.key}>
                              {items.indexOf(p) + 1}. {p.label || "—"}
                            </option>
                          ))}
                        </select>
                        {parent && (
                          <>
                            <span className="text-muted-foreground">{t("flow.answer")}</span>
                            <select
                              className={nativeSelect + " w-auto"}
                              value={item.show_when}
                              onChange={(e) => update(idx, { show_when: e.target.value })}
                            >
                              {vals.map((v) => (
                                <option key={v} value={v}>
                                  {yesNo(v)}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap items-center gap-4 text-sm md:col-span-3">
                    {(
                      [
                        ["required", t("common.required")],
                        ["allow_note", t("templates.allowNote")],
                        ["allow_photo", t("templates.allowPhoto")],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field} className="flex items-center gap-2">
                        <Switch checked={item[field]} onCheckedChange={(v) => update(idx, { [field]: v })} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                {manage && (
                  <div className="flex flex-col gap-1">
                    <Button type="button" size="icon" variant="ghost" aria-label="Upp" onClick={() => move(idx, -1)}>
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Ner" onClick={() => move(idx, 1)}>
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("common.delete")}
                      onClick={() => setItems((l) => l.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        {manage && (
          <Button type="button" variant="outline" onClick={add}>
            <Plus className="size-4" /> {t("templates.addItem")}
          </Button>
        )}
      </fieldset>
    </>
  );
}
