import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerDownRight,
  GitBranch,
  GripVertical,
  ListTree,
  Network,
  Plus,
  Trash2,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FlowTree } from "@/components/FlowTree";
import { OptionRows } from "@/components/OptionRows";
import { Hint } from "@/components/Hint";
import { MERGE, branchValues, jumpKeys, lanesOf, type FlowNode } from "@/lib/flow";
import { LEVELS, type Level } from "@/lib/levels";
import { sectionOrder } from "@/lib/sections";
import { laneColors, type LaneColor } from "@/lib/laneColors";
import { currentVersionId, writeVersion } from "@/lib/versions";
import { applyBaseChange, folderOf } from "@/lib/items";
import { MAIN, buildTree, containerOf, moveItem, type TreeRow } from "@/lib/treeMove";
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
  /** Answer value → key of a later item to jump to. */
  jumps: Record<string, string>;
  /** Experience levels the question is shown to. */
  levels: Level[];
  /** item_key of the base checklist question this one was copied from, or "". */
  baseKey: string;
};

const optList = (s: string) => s.split("\n").map((o) => o.trim()).filter(Boolean);

export const Route = createFileRoute("/_authenticated/templates/$templateId")({
  head: () => ({ meta: [{ title: "Redigera checklista — Checklista" }] }),
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
      const verId = await currentVersionId(templateId, tpl.current_version);
      const { data: items } = verId
        ? await supabase.from("template_items").select("*").eq("version_id", verId).order("position")
        : { data: [] };
      return { tpl, items: items ?? [] };
    },
  });

  const [meta, setMeta] = useState({ title: "", description: "", category: "" });
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [defaultLevels, setDefaultLevels] = useDefaultLevels();
  const [zoom, setZoom] = useZoom();
  // The tree is a canvas: drag the background to pan, Ctrl/⌘ + scroll or
  // pinch to zoom around the pointer. The wheel listener is attached natively
  // since React's is passive and can't stop the browser from zooming the page.
  const treeRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [panning, setPanning] = useState(false);
  useEffect(() => {
    const el = treeRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const from = zoomRef.current;
      const to = clampZoom(from * Math.exp(-e.deltaY * 0.0025));
      // keep the point under the pointer in place
      const box = el.getBoundingClientRect();
      const px = e.clientX - box.left;
      const py = e.clientY - box.top;
      const cx = (el.scrollLeft + px) / from;
      const cy = (el.scrollTop + py) / from;
      setZoom(to);
      requestAnimationFrame(() => {
        el.scrollLeft = cx * to - px;
        el.scrollTop = cy * to - py;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });
  const startPan = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Only the empty background pans; cards, fields and buttons work as usual.
    if (e.button !== 0 || target.closest(".\\@container, button, input, select, textarea, label, a")) return;
    const el = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture(e.pointerId);
    setPanning(true);
    const move = (ev: PointerEvent) => {
      el.scrollLeft = start.left - (ev.clientX - start.x);
      el.scrollTop = start.top - (ev.clientY - start.y);
    };
    const end = () => {
      setPanning(false);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  };
  /** Zooms so every card and branch fits the width, and scrolls to them. */
  const fitTree = () => {
    const el = treeRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    // The rows' side columns are wider than their content; measure what is drawn.
    const boxes = [...canvas.querySelectorAll<HTMLElement>(".\\@container, section")].map((n) => n.getBoundingClientRect());
    if (!boxes.length) return;
    const left = Math.min(...boxes.map((b) => b.left));
    const right = Math.max(...boxes.map((b) => b.right));
    const from = zoomRef.current;
    const to = clampZoom((from * (el.clientWidth - 48)) / (right - left));
    const origin = el.getBoundingClientRect().left;
    const contentLeft = (el.scrollLeft + left - origin) / from;
    setZoom(to);
    requestAnimationFrame(() => {
      el.scrollLeft = contentLeft * to - 24;
      el.scrollTop = 0;
    });
  };
  // Section shown in the editor ("" = all), and sections added but not used yet.
  const [chapter, setChapter] = useState("");
  const [extraSections, setExtraSections] = useState<string[]>([]);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  // Drag and drop: a card becomes draggable when pressed outside its form
  // fields, so text in inputs can still be selected with the mouse.
  const [dragArmed, setDragArmed] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ key: string; after: boolean } | null>(null);
  // Branches shown in full; the others show only their heading.
  const [openLanes, setOpenLanes] = useState<Set<string>>(new Set());
  // A collapsed branch heading the dragged question hovers over.
  const [dropLane, setDropLane] = useState<string | null>(null);
  const [treeMenu, setTreeMenu] = useState(false);
  // Branches opened big by double-click, outermost first; empty shows the main branch.
  const [laneFocus, setLaneFocus] = useState<{ owner: string; start: string }[]>([]);
  // A single click waits briefly so a double-click can open the branch big
  // instead; otherwise the first click would swap the element under the pointer.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const laneClick = (id: string, open: boolean) => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => toggleLane(id, open), 220);
  };
  const focusLane = (owner: string, start: string) => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    setLaneFocus((f) => [...f, { owner, start }]);
    requestAnimationFrame(() => treeRef.current?.scrollTo({ left: 0, top: 0 }));
  };
  useEffect(() => {
    if (!laneFocus.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLaneFocus((f) => f.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [laneFocus.length]);
  const toggleLane = (id: string, open?: boolean) =>
    setOpenLanes((s) => {
      const next = new Set(s);
      if (open ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });

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
    const posKey = new Map(items.map((i) => [i.position, i.item_key ?? i.id]));
    setItems(
      items.map((i) => ({
        parent: i.parent_position != null ? (posKey.get(i.parent_position) ?? "") : "",
        show_when: i.show_when ?? "",
        jumps: jumpKeys(i.jump_to, posKey),
        levels: Array.isArray(i.levels) ? LEVELS.filter((l) => i.levels.includes(l)) : [...LEVELS],
        // item_key stays the same across versions; older databases only have id.
        key: i.item_key ?? i.id,
        baseKey: i.base_key ?? "",
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
    jumps: i.jumps,
  }));
  const yesNo = (v: string) => (v === "true" ? t("flow.yes") : v === "false" ? t("flow.no") : v);

  // Branch focus: show only the questions that live under the focused question's branch.
  const branchKeys = (() => {
    if (!focusKey) return null;
    const byKey = new Map(items.map((i) => [i.key, i]));
    const inBranch = (key: string, depth = 0): boolean => {
      if (key === focusKey) return true;
      if (depth > 50) return false;
      const parent = byKey.get(key)?.parent;
      return !!parent && inBranch(parent, depth + 1);
    };
    return new Set(items.filter((i) => inBranch(i.key)).map((i) => i.key));
  })();
  const focusItem = focusKey ? items.find((i) => i.key === focusKey) : undefined;
  const sections = sectionOrder([...items.map((i) => i.section), ...extraSections], true);
  const inChapter = (i: DraftItem) => !chapter || i.section.trim() === chapter;
  const shownItems = items.filter((i) => (branchKeys ? branchKeys.has(i.key) : true) && inChapter(i));
  const addSection = () => {
    const name = window.prompt(t("section.newPrompt"))?.trim();
    if (!name) return null;
    if (!sections.includes(name)) setExtraSections((l) => [...l, name]);
    return name;
  };

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
  const duplicate = (idx: number) => {
    const src = items[idx]!;
    const copy = { ...src, key: crypto.randomUUID(), baseKey: "", jumps: { ...src.jumps }, levels: [...src.levels] };
    setItems((list) => [...list.slice(0, idx + 1), copy, ...list.slice(idx + 1)]);
    jumpToItem(copy.key);
  };

  const endDrag = () => {
    setDragArmed(null);
    setDragKey(null);
    setDropAt(null);
    setDropLane(null);
  };
  /**
   * Drops `key` before or after the question `at`, in whatever branch `at`
   * sits in, keeping jumps and merge points pointing at the same branches.
   */
  const dropNextTo = (key: string, at: string, after: boolean) =>
    setItems((list) => {
      const c = containerOf(list, at);
      if (!c) return list;
      const pos = c.rows.findIndex((r) => r.key === at);
      const before = after ? (c.rows[pos + 1]?.key ?? null) : at;
      return moveItem(list, key, c.id, before === key ? null : before);
    });
  const dropInLane = (key: string, lane: string) => setItems((list) => moveItem(list, key, lane, null));

  const newItem = (section: string): DraftItem => ({
    key: crypto.randomUUID(),
    baseKey: "",
    section,
    type: "checkbox",
    label: "",
    help_text: "",
    required: false,
    allow_note: false,
    allow_photo: false,
    options: "",
    parent: "",
    show_when: "",
    jumps: {},
    levels: [...defaultLevels],
  });
  /** Inserts a new question at `at`, e.g. at the end of a branch. */
  const addAt = (at: number, section: string) => {
    const item = newItem(section);
    setItems((list) => [...list.slice(0, at), item, ...list.slice(at)]);
    jumpToItem(item.key);
  };
  /**
   * Adds a question right below the one with key `key`. Below a question with
   * branches it goes after them, where they meet, and becomes the new merge
   * point so the flow continues straight down.
   */
  const addBelow = (key: string) => {
    const item = newItem("");
    setItems((list) => {
      const idx = list.findIndex((i) => i.key === key);
      if (idx < 0) return list;
      const owner = list[idx]!;
      item.section = owner.section;
      const split = lanesOf(list.map((i) => ({ key: i.key, section: i.section, jumps: i.jumps })), idx);
      const at = split ? split.merge : idx + 1;
      const next = [...list.slice(0, at), item, ...list.slice(at)];
      return split
        ? next.map((i) => (i.key === owner.key ? { ...i, jumps: { ...i.jumps, [MERGE]: item.key } } : i))
        : next;
    });
    jumpToItem(item.key);
  };

  const add = () =>
    setItems((list) => {
      const item = newItem(chapter || (list.at(-1)?.section ?? ""));
      // With a section picked, the new question goes last in that section.
      const last = chapter ? list.map((i) => i.section.trim()).lastIndexOf(chapter) : -1;
      return last >= 0 ? [...list.slice(0, last + 1), item, ...list.slice(last + 1)] : [...list, item];
    });

  /**
   * Passes a saved base checklist's changes on to the checklists that use it:
   * every checklist for the general base, the folder's checklists for a folder base.
   */
  async function propagateBase(
    base: { id: string; category: string | null },
    oldItems: Database["public"]["Tables"]["template_items"]["Row"][],
    newItems: { item_key: string; label: string; position: number }[],
    messages: Parameters<typeof writeVersion>[0]["messages"],
  ) {
    // Without stable question keys (older database) changes can't be matched.
    if (oldItems.some((i) => !i.item_key)) return 0;
    const { data: targets } = await supabase
      .from("templates")
      .select("id, category, current_version, delete_after")
      .eq("org_id", ctx.orgId)
      .eq("is_base", false);
    let updated = 0;
    for (const target of targets ?? []) {
      if (target.delete_after) continue;
      if (folderOf(base.category) && folderOf(target.category) !== folderOf(base.category)) continue;
      const verId = await currentVersionId(target.id, target.current_version);
      if (!verId) continue;
      const { data: current } = await supabase.from("template_items").select("*").eq("version_id", verId);
      const next = applyBaseChange(
        (current ?? []).map((i) => ({ ...i, item_key: i.item_key })),
        oldItems.map((i) => ({ ...i })),
        newItems.map((i) => ({ ...i, id: i.item_key, parent_position: null, show_when: null })),
      );
      if (!next) continue;
      await writeVersion({
        templateId: target.id,
        orgId: ctx.orgId,
        userId: ctx.userId,
        currentVersion: target.current_version,
        rows: next.map(({ version_id: _v, org_id: _o, ...r }) => r),
        messages,
      });
      await logAudit(ctx.orgId, ctx.userId, "template.updated_from_base", "template", target.id, { base: base.id });
      updated++;
    }
    return updated;
  }

  async function save() {
    if (!meta.title.trim()) return;
    setSaving(true);
    try {
      const tpl = query.data!.tpl;
      const kept = items.filter((i) => i.label.trim());
      // Questions without text are skipped; say so if they had other content.
      const skipped = items.filter((i) => !i.label.trim() && (optList(i.options).length || i.help_text.trim())).length;
      if (skipped) toast.warning(t("templates.skippedNoText", { count: skipped }));
      const keyPos = new Map(kept.map((i, idx) => [i.key, idx]));
      const rows = kept.map((i, position) => ({
        item_key: i.key,
        base_key: i.baseKey || null,
        parent_position: i.parent && i.show_when && keyPos.has(i.parent) ? keyPos.get(i.parent)! : null,
        show_when: i.parent && i.show_when && keyPos.has(i.parent) ? i.show_when : null,
        // Keep jumps to items that still exist, come later, and use a current answer value.
        jump_to: Object.fromEntries(
          Object.entries(i.jumps).flatMap(([v, key]) => {
            const target = keyPos.get(key);
            const valid = v === MERGE || branchValues(i.type, optList(i.options)).includes(v);
            return valid && target !== undefined && target > position ? [[v, target]] : [];
          }),
        ),
        levels: i.levels,
        position,
        section: i.section.trim() || null,
        type: i.type,
        label: i.label.trim(),
        help_text: i.help_text.trim() || null,
        required: i.required,
        allow_note: i.allow_note,
        allow_photo: i.allow_photo,
        options: i.type === "dropdown" || i.type === "checkbox" ? optList(i.options) : [],
      }));
      const messages = {
        itemsMissing: (saved: number, total: number) => t("templates.saveItemsMissing", { saved, total }),
        notApplied: t("templates.saveNotApplied"),
      };
      const { version: nextVersion, dropped } = await writeVersion({
        templateId: tpl.id,
        orgId: ctx.orgId,
        userId: ctx.userId,
        currentVersion: tpl.current_version,
        rows,
        patch: {
          title: meta.title.trim(),
          description: meta.description || null,
          category: meta.category.trim() || null,
        },
        messages,
      });
      if (dropped.some((c) => c === "jump_to" || c === "levels")) toast.warning(t("flow.jumpsNotSaved"));
      if (tpl.is_base) {
        const n = await propagateBase(tpl, query.data!.items, rows, messages);
        if (n) toast.success(t("templates.basePropagated", { count: n }));
      }
      await logAudit(ctx.orgId, ctx.userId, "template.updated", "template", tpl.id, {
        title: meta.title,
        version: nextVersion,
      });
      toast.success(t("templates.saved"));
      qc.invalidateQueries({ queryKey: ["template", templateId] });
      qc.invalidateQueries({ queryKey: ["templates", ctx.orgId] });
    } catch (err) {
      // Supabase errors are plain objects with a message, not Error instances.
      const message = (err as { message?: unknown })?.message;
      toast.error(typeof message === "string" && message ? message : t("error.generic"));
    } finally {
      setSaving(false);
    }
  }

  // Questions laid out as a tree: after a question with jumps, each answer's
  // branch is shown to the right of it and the list continues where they meet.
  const laneNodes = items.map((i) => ({ key: i.key, section: i.section, jumps: i.jumps }));
  const shownKeys = new Set(shownItems.map((i) => i.key));
  const laneLabel = (values: string[]) =>
    values.length ? values.map(yesNo).join(" / ") : t("flow.otherAnswers");

  /** Color of the branch each answer of the question at `idx` leads into. */
  const answerColors = (idx: number): Record<string, LaneColor> => {
    const split = lanesOf(laneNodes, idx);
    if (!split) return {};
    const colors = laneColors(split.lanes);
    return Object.fromEntries(split.lanes.flatMap((l, k) => l.values.map((v) => [v, colors[k]!] as const)));
  };

  const renderCard = (item: DraftItem, inLane: boolean) => {
    const idx = items.findIndex((i) => i.key === item.key);
    const colors = answerColors(idx);
    return (
            <div
              key={item.key}
              ref={(el) => {
                if (el) itemRefs.current.set(item.key, el);
                else itemRefs.current.delete(item.key);
              }}
              draggable={manage && !focusKey && dragArmed === item.key}
              onPointerDown={(e) => {
                const field = (e.target as HTMLElement).closest("input, textarea, select, button, label, [role=checkbox]");
                setDragArmed(field ? null : item.key);
              }}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", item.key);
                setDragKey(item.key);
              }}
              onDragOver={(e) => {
                if (!dragKey) return;
                e.preventDefault();
                const box = e.currentTarget.getBoundingClientRect();
                const after = e.clientY > box.top + box.height / 2;
                if (dropAt?.key !== item.key || dropAt.after !== after) setDropAt({ key: item.key, after });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragKey && dropAt) dropNextTo(dragKey, dropAt.key, dropAt.after);
                endDrag();
              }}
              onDragEnd={endDrag}
              className={cn(
                // @container: the card lays out by its own width, also when narrow in a branch.
                "@container relative shrink-0 rounded-xl border bg-card p-4 shadow-soft transition-all",
                // Fixed widths keep the tree's columns lined up on the canvas.
                inLane ? "w-[27rem]" : "w-[46rem]",
                manage && !focusKey && "cursor-grab active:cursor-grabbing",
                highlightKey === item.key && "border-primary ring-2 ring-primary/40",
                dragKey === item.key && "opacity-40",
              )}
            >
              {dropAt?.key === item.key && dragKey !== item.key && (
                <span
                  className={cn(
                    "pointer-events-none absolute inset-x-2 h-1 rounded-full bg-primary",
                    dropAt.after ? "-bottom-2.5" : "-top-2.5",
                  )}
                />
              )}
              <div className="flex items-start gap-3">
                <div className="mt-2 flex shrink-0 flex-col items-center gap-1">
                  <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {idx + 1}
                  </span>
                  {manage && !focusKey && (
                    <Hint text={t("templates.dragHint")}>
                      <GripVertical className="size-4 text-muted-foreground" />
                    </Hint>
                  )}
                </div>
                <div className="grid flex-1 gap-3 @sm:grid-cols-2 @2xl:grid-cols-[1fr_10rem_10rem]">
                  <Input
                    className="@sm:col-span-2 @2xl:col-span-1"
                    placeholder={t("templates.label")}
                    value={item.label}
                    onChange={(e) => update(idx, { label: e.target.value })}
                  />
                  <select
                    className={nativeSelect}
                    aria-label={t("section.title")}
                    value={item.section.trim()}
                    onChange={(e) => {
                      const v = e.target.value === ADD_SECTION ? addSection() : e.target.value;
                      if (v !== null) update(idx, { section: v });
                    }}
                  >
                    <option value="">{t("section.none")}</option>
                    {sections.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    <option value={ADD_SECTION}>{t("section.add")}</option>
                  </select>
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
                    className="@sm:col-span-2 @2xl:col-span-3"
                    placeholder={`${t("templates.helpText")} (${t("common.optional")})`}
                    value={item.help_text}
                    onChange={(e) => update(idx, { help_text: e.target.value })}
                  />
                  {(item.type === "checkbox" || item.type === "dropdown") && (
                    <OptionRows
                      kind={item.type}
                      value={item.options}
                      onChange={(options) => update(idx, { options })}
                      onRename={(from, to) => update(idx, { jumps: renameJump(item.jumps, from, to) })}
                      rowClass={(option) => (colors[option] ? cn("border-l-4 pl-2", colors[option].bar) : undefined)}
                      extra={(option) =>
                        option && idx < items.length - 1 ? (
                          <JumpSelect
                            value={item.jumps[option]}
                            later={items.slice(idx + 1)}
                            number={(key) => items.findIndex((x) => x.key === key) + 1}
                            onChange={(key) => update(idx, { jumps: setJump(item.jumps, option, key) })}
                          />
                        ) : null
                      }
                    />
                  )}
                  {(() => {
                    const parents = items.slice(0, idx).filter((p) => p.type === "checkbox" || p.type === "dropdown");
                    const parent = parents.find((p) => p.key === item.parent);
                    const vals = parent ? branchValues(parent.type, optList(parent.options)) : [];
                    return (
                      <div className="flex flex-wrap items-center gap-2 text-sm @sm:col-span-2 @2xl:col-span-3">
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
                  <JumpEditor
                    item={item}
                    later={items.slice(idx + 1)}
                    number={(key) => items.findIndex((x) => x.key === key) + 1}
                    yesNo={yesNo}
                    colors={colors}
                    onChange={(jumps) => update(idx, { jumps })}
                  />
                  <div className="flex flex-wrap items-center gap-4 text-sm @sm:col-span-2 @2xl:col-span-3">
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
                    <div className="@2xl:ml-auto">
                      <LevelPicker
                        label={t("level.shownFor")}
                        hint={t("level.shownForHint")}
                        value={item.levels}
                        onChange={(levels) => update(idx, { levels })}
                      />
                    </div>
                  </div>
                </div>
                {manage && (
                  <div className="flex flex-col gap-1">
                    {(item.type === "checkbox" || item.type === "dropdown") && focusKey !== item.key && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title={t("flow.enterBranch")}
                        aria-label={t("flow.enterBranch")}
                        onClick={() => setFocusKey(item.key)}
                      >
                        <GitBranch className="size-4 text-primary" />
                      </Button>
                    )}
                    {!focusKey && (
                      <>
                        <Button type="button" size="icon" variant="ghost" aria-label="Upp" onClick={() => move(idx, -1)}>
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" aria-label="Ner" onClick={() => move(idx, 1)}>
                          <ArrowDown className="size-4" />
                        </Button>
                      </>
                    )}
                    <Hint text={t("templates.duplicateItem")}>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t("templates.duplicateItem")}
                        onClick={() => duplicate(idx)}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </Hint>
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
            </div>
    );
  };

  const renderLane = (
    l: { values: string[]; start: number; end: number },
    color: LaneColor,
    owner: DraftItem,
    depth: number,
  ) => {
    const id = `${owner.key}:${items[l.start]?.key ?? l.start}`;
    const open = openLanes.has(id);
    const header = (
      <span className={cn("flex items-center gap-1.5 text-xs font-semibold", color.text)}>
        <span className={cn("size-2.5 rounded-full", color.dot)} />
        {t("flow.if")} {laneLabel(l.values)}
        <span className="font-normal text-muted-foreground">· {t("flow.laneCount", { count: l.end - l.start })}</span>
        <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
      </span>
    );
    if (!open) {
      // Collapsed: only the heading, click to open the branch.
      return (
        <Hint text={t("flow.openLaneHint")}>
          <button
            type="button"
            onClick={() => laneClick(id, true)}
            onDoubleClick={() => items[l.start] && focusLane(owner.key, items[l.start]!.key)}
            // Drop a question on a collapsed branch to put it last in that branch.
            onDragOver={(e) => {
              if (!dragKey) return;
              e.preventDefault();
              setDropLane(id);
            }}
            onDragLeave={() => setDropLane((d) => (d === id ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragKey) dropInLane(dragKey, id);
              endDrag();
            }}
            className={cn(
              "rounded-xl border-2 border-dashed px-3 py-2 text-left hover:shadow-soft",
              color.border,
              color.bg,
              dropLane === id && "ring-2 ring-primary ring-offset-2",
            )}
          >
            {header}
          </button>
        </Hint>
      );
    }
    return (
      <section className={cn("w-max rounded-xl border-2 border-dashed p-3", color.border, color.bg)}>
        <button
          type="button"
          className="mb-2"
          onClick={() => laneClick(id, false)}
          onDoubleClick={() => items[l.start] && focusLane(owner.key, items[l.start]!.key)}
          aria-expanded
        >
          {header}
        </button>
        <ol className="space-y-4">{renderRange(l.start, l.end, depth + 1)}</ol>
        {manage && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => addAt(l.end, items[l.end - 1]?.section ?? owner.section)}
          >
            <Plus className="size-4" /> {t("flow.addInLane")}
          </Button>
        )}
      </section>
    );
  };

  /**
   * One side of a branching question: its branches side by side, hung from a
   * horizontal line that starts at the question card. `side` decides which
   * end of the line touches the card.
   */
  const laneGroup = (
    lanes: { lane: { values: string[]; start: number; end: number }; color: LaneColor }[],
    side: "left" | "right",
    owner: DraftItem,
    depth: number,
  ) => (
    <div className={cn("flex items-start", side === "left" && "flex-row-reverse")}>
      {lanes.map(({ lane, color }, n) => {
        const farthest = n === lanes.length - 1;
        return (
          <div key={lane.start} className="relative px-4 pt-10">
            {/* horizontal line from the card, ending above the farthest branch */}
            <span
              className={cn(
                "absolute top-5 h-0.5 bg-muted-foreground/40",
                side === "right" ? (farthest ? "left-0 right-1/2" : "inset-x-0") : farthest ? "left-1/2 right-0" : "inset-x-0",
              )}
            />
            {/* drop from the line to the branch, in the branch's color */}
            <span className={cn("absolute left-1/2 top-5 h-5 w-0.5 -translate-x-1/2", color.dot)} />
            <span className={cn("absolute left-1/2 top-[2.1rem] size-2 -translate-x-1/2 rounded-full", color.dot)} />
            {renderLane(lane, color, owner, depth)}
          </div>
        );
      })}
    </div>
  );

  /** A small "+" under a card that adds the next question straight below it. */
  const addBelowRow = (item: DraftItem) => (
    <li key={`${item.key}-below`} data-add-below className="-my-2 grid grid-cols-[1fr_auto_1fr]">
      <div />
      <div className="flex flex-col items-center">
        <span className="h-2 w-0.5 bg-muted-foreground/30" />
        <Hint text={t("flow.addBelowHint")}>
          <button
            type="button"
            aria-label={t("flow.addBelow")}
            onClick={() => addBelow(item.key)}
            className="flex size-6 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-soft hover:border-primary hover:text-primary"
          >
            <Plus className="size-3.5" />
          </button>
        </Hint>
        <span className="h-2 w-0.5 bg-muted-foreground/30" />
      </div>
      <div />
    </li>
  );

  // The focused branches, resolved against the current questions. A branch
  // that no longer exists (e.g. its question was deleted) ends the focus there.
  const focused: { lane: { values: string[]; start: number; end: number }; color: LaneColor; owner: DraftItem }[] = [];
  for (const f of laneFocus) {
    const bound = focused.at(-1)?.lane.end ?? items.length;
    const idx = items.findIndex((i) => i.key === f.owner);
    const split = idx >= 0 ? lanesOf(laneNodes, idx, bound) : null;
    const k = split ? split.lanes.findIndex((l) => items[l.start]?.key === f.start) : -1;
    if (!split || k < 0) break;
    focused.push({ lane: split.lanes[k]!, color: laneColors(split.lanes)[k]!, owner: items[idx]! });
  }
  const current = focused.at(-1);

  const renderRange = (from: number, to: number, depth: number): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    let i = from;
    while (i < to) {
      const item = items[i]!;
      const split = !focusKey && depth < 6 ? lanesOf(laneNodes, i, to) : null;
      if (!shownKeys.has(item.key)) {
        i++;
        continue;
      }
      // Every row is a three-column grid with the card in the middle, so cards
      // line up and branches grow out to both sides.
      if (!split) {
        out.push(
          <li key={item.key} className="grid grid-cols-[1fr_auto_1fr] items-start">
            <div />
            {renderCard(item, depth > 0)}
            <div />
          </li>,
        );
        if (manage && !focusKey) out.push(addBelowRow(item));
        i++;
        continue;
      }
      // Branches alternate sides: the first to the right, the second to the left, and so on.
      const colors = laneColors(split.lanes);
      const all = split.lanes.map((lane, k) => ({ lane, color: colors[k]!, k }));
      const right = all.filter(({ k }) => k % 2 === 0);
      const left = all.filter(({ k }) => k % 2 === 1);
      out.push(
        <li key={item.key} className="grid grid-cols-[1fr_auto_1fr] items-start">
          <div className="justify-self-end">{left.length > 0 && laneGroup(left, "left", item, depth)}</div>
          {renderCard(item, depth > 0)}
          <div className="justify-self-start">{laneGroup(right, "right", item, depth)}</div>
        </li>,
      );
      if (manage) out.push(addBelowRow(item));
      i = split.merge;
    }
    return out;
  };

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
      {query.data.tpl.is_base && (
        <p className="mb-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          {t("templates.baseEditorNote")}
        </p>
      )}

      <fieldset disabled={!manage} className="min-w-0 space-y-6">
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

        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm">
          <Hint text={t("section.filterHint")}>
            <span className="cursor-help font-medium underline decoration-dotted underline-offset-4">
              {t("section.title")}
            </span>
          </Hint>
          <select
            className={nativeSelect + " w-auto min-w-40"}
            value={chapter}
            onChange={(e) => {
              if (e.target.value === ADD_SECTION) {
                const name = addSection();
                if (name) setChapter(name);
              } else setChapter(e.target.value);
            }}
          >
            <option value="">{t("section.all")}</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s} ({items.filter((i) => i.section.trim() === s).length})
              </option>
            ))}
            {manage && <option value={ADD_SECTION}>{t("section.add")}</option>}
          </select>
          {chapter && (
            <span className="text-xs text-muted-foreground">{t("section.filtered", { count: items.length - shownItems.length })}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("templates.versionNote")}</p>
          <div className="text-sm">
            <LevelPicker
              label={t("level.newDefault")}
              hint={t("level.newDefaultHint")}
              value={defaultLevels}
              onChange={setDefaultLevels}
            />
          </div>
        </div>

        {items.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t("templates.noItems")}
          </div>
        )}

        {focusItem && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
            <GitBranch className="size-4 text-primary" />
            <span>
              {t("flow.branchFocus")} <strong>{focusItem.label || "—"}</strong>
            </span>
            <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => setFocusKey(null)}>
              {t("flow.showAll")}
            </Button>
          </div>
        )}

        <div className="relative min-w-0 max-w-full">
          <div
            ref={treeRef}
            className={cn(
              "h-[78vh] overflow-auto rounded-xl border bg-muted/30 [overscroll-behavior:contain]",
              panning ? "cursor-grabbing select-none" : "cursor-grab",
            )}
            onPointerDown={startPan}
          >
            {/* zoom scales layout too, so a zoomed-out tree takes less room instead of just shrinking */}
            <div ref={canvasRef} className="w-max min-w-full p-8" style={{ zoom }}>
              {current ? (
                <div className="mx-auto w-max pt-16">
                  <div className={cn("mb-4 rounded-xl border-2 border-dashed px-4 py-2", current.color.border, current.color.bg)}>
                    <p className={cn("flex items-center gap-2 text-sm font-semibold", current.color.text)}>
                      <span className={cn("size-3 rounded-full", current.color.dot)} />
                      {current.owner.label || "—"} · {t("flow.if")} {laneLabel(current.lane.values)}
                    </p>
                  </div>
                  <ol className="space-y-4">{renderRange(current.lane.start, current.lane.end, 0)}</ol>
                  {manage && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4"
                      onClick={() => addAt(current.lane.end, items[current.lane.end - 1]?.section ?? current.owner.section)}
                    >
                      <Plus className="size-4" /> {t("flow.addInLane")}
                    </Button>
                  )}
                </div>
              ) : (
                <ol className="space-y-4">{renderRange(0, items.length, 0)}</ol>
              )}
            </div>
          </div>
          <ZoomBar zoom={zoom} setZoom={setZoom} onFit={fitTree} />
          <div className={cn("absolute left-4 z-20", current ? "top-16" : "top-4")}>
            <Hint text={t("tree.toggleHint")}>
              <Button
                type="button"
                size="sm"
                variant={treeMenu ? "default" : "outline"}
                className="rounded-full shadow-lg"
                onClick={() => setTreeMenu((v) => !v)}
                aria-expanded={treeMenu}
              >
                <ListTree className="size-4" /> {t("tree.title")}
              </Button>
            </Hint>
            {treeMenu && (
              <TreeMenu
                items={items}
                manage={manage}
                dragKey={dragKey}
                setDragKey={setDragKey}
                label={laneLabel}
                onMove={(key, container, before) => setItems((list) => moveItem(list, key, container, before))}
                onShow={(key) => {
                  // Open every branch on the way to the question, then show it.
                  const path: string[] = [];
                  const find = (rows: TreeRow[]): boolean =>
                    rows.some((r) => r.key === key || r.lanes.some((l) => (find(l.rows) ? (path.push(l.id), true) : false)));
                  find(buildTree(laneNodes));
                  path.forEach((id) => toggleLane(id, true));
                  setLaneFocus([]);
                  jumpToItem(key);
                }}
              />
            )}
          </div>
          {current && (
            <>
              <nav
                className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-1 rounded-full border bg-card/95 px-2 py-1 text-sm shadow-lg backdrop-blur"
                aria-label={t("flow.breadcrumb")}
              >
                <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => setLaneFocus([])}>
                  <ArrowLeft className="size-4" /> {t("flow.mainBranch")}
                </Button>
                {focused.map((f, n) => (
                  <span key={n} className="flex items-center gap-1">
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                    <button
                      type="button"
                      disabled={n === focused.length - 1}
                      onClick={() => setLaneFocus((st) => st.slice(0, n + 1))}
                      className={cn("flex items-center gap-1.5 rounded-full px-2 py-1 font-medium", f.color.text, n < focused.length - 1 && "hover:bg-muted")}
                    >
                      <span className={cn("size-2 rounded-full", f.color.dot)} /> {laneLabel(f.lane.values)}
                    </button>
                  </span>
                ))}
              </nav>
              <MiniTree
                items={items}
                laneNodes={laneNodes}
                current={current.lane}
                label={laneLabel}
                onBack={() => setLaneFocus([])}
                onFocus={(owner, start) => setLaneFocus([{ owner, start }])}
              />
            </>
          )}
        </div>

        {manage && (
          <Button type="button" variant="outline" onClick={add}>
            <Plus className="size-4" /> {t("templates.addItem")}
          </Button>
        )}
      </fieldset>
    </>
  );
}

function setJump(jumps: Record<string, string>, value: string, key: string) {
  const next = { ...jumps };
  if (key) next[value] = key;
  else delete next[value];
  return next;
}

function renameJump(jumps: Record<string, string>, from: string, to: string) {
  if (from === to || !jumps[from]) return jumps;
  const { [from]: key, ...rest } = jumps;
  return to ? { ...rest, [to]: key! } : rest;
}

// Picks a later question to jump to for one answer; the ones in between are
// skipped. Collapsed to a small arrow button until opened or a jump is set.
function JumpSelect({
  value,
  later,
  number,
  onChange,
  defaultOpen = false,
}: {
  value: string | undefined;
  later: DraftItem[];
  number: (key: string) => number;
  onChange: (key: string) => void;
  defaultOpen?: boolean;
}) {
  const t = useT();
  const current = value && later.some((x) => x.key === value) ? value : "";
  const [open, setOpen] = useState(defaultOpen);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (open && !defaultOpen) selectRef.current?.focus();
  }, [open, defaultOpen]);

  if (!open && !current) {
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        tabIndex={-1}
        className="shrink-0 text-muted-foreground hover:text-primary"
        title={t("flow.addJump")}
        aria-label={t("flow.addJump")}
        onClick={() => setOpen(true)}
      >
        <CornerDownRight className="size-4" />
      </Button>
    );
  }

  return (
    <label className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
      <CornerDownRight className="size-4 text-primary" aria-label={t("flow.goTo")} />
      <select
        ref={selectRef}
        className={nativeSelect + " w-auto max-w-[12rem]"}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => !defaultOpen && setOpen(false)}
      >
        <option value="">{t("flow.nextQuestion")}</option>
        {later.map((x) => (
          <option key={x.key} value={x.key}>
            {number(x.key)}. {x.label || "—"}
          </option>
        ))}
      </select>
    </label>
  );
}

// Jumps for a yes/no checkbox, which has no option rows to put them next to.
function JumpEditor({
  item,
  later,
  number,
  yesNo,
  colors,
  onChange,
}: {
  item: DraftItem;
  later: DraftItem[];
  number: (key: string) => number;
  yesNo: (v: string) => string;
  colors: Record<string, LaneColor>;
  onChange: (jumps: Record<string, string>) => void;
}) {
  const t = useT();
  const values = item.type === "checkbox" && !optList(item.options).length ? ["true", "false"] : [];
  const hasJumps = Object.keys(item.jumps).length > 0;
  const [open, setOpen] = useState(hasJumps);
  if (!values.length || !later.length) return null;

  if (!open && !hasJumps) {
    return (
      <div className="@sm:col-span-2 @2xl:col-span-3">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <CornerDownRight className="size-4" /> {t("flow.addJump")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3 text-sm @sm:col-span-2 @2xl:col-span-3">
      <p className="flex items-center gap-1.5 font-medium">
        <CornerDownRight className="size-4 text-primary" /> {t("flow.jumpTitle")}
      </p>
      {values.map((v) => (
        <div key={v} className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{t("flow.if")}</span>
          <span className="inline-flex items-center gap-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
            {colors[v] && <span className={cn("size-2.5 rounded-full", colors[v].dot)} />}
            {yesNo(v)}
          </span>
          <span className="text-muted-foreground">{t("flow.goTo")}</span>
          <JumpSelect
            defaultOpen
            value={item.jumps[v]}
            later={later}
            number={number}
            onChange={(key) => onChange(setJump(item.jumps, v, key))}
          />
        </div>
      ))}
    </div>
  );
}

// Which experience levels see the question; at least one stays selected.
function LevelPicker({
  value,
  onChange,
  label,
  hint,
}: {
  value: Level[];
  onChange: (levels: Level[]) => void;
  label: string;
  hint: string;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Hint text={hint}>
        <span className="cursor-help text-muted-foreground underline decoration-dotted underline-offset-4">{label}</span>
      </Hint>
      {LEVELS.map((l) => {
        const on = value.includes(l);
        return (
          <Hint key={l} text={t(`level.${l}Hint`)}>
            <button
              type="button"
              aria-pressed={on}
              disabled={on && value.length === 1}
              onClick={() =>
                onChange(on ? value.filter((x) => x !== l) : LEVELS.filter((x) => x === l || value.includes(x)))
              }
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-primary/50",
              )}
            >
              {t(`level.${l}`)}
            </button>
          </Hint>
        );
      })}
    </div>
  );
}

const ADD_SECTION = "\u0000add";

const ZOOM_KEY = "checklista.editorZoom";
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;
const clampZoom = (z: number) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;

/** Editor tree zoom, remembered per browser. */
function useZoom() {
  const [zoom, setZoomState] = useState(() => {
    try {
      const z = Number(localStorage.getItem(ZOOM_KEY));
      return z >= ZOOM_MIN && z <= ZOOM_MAX ? z : 1;
    } catch {
      return 1;
    }
  });
  const setZoom = (z: number) => {
    const next = clampZoom(z);
    setZoomState(next);
    try {
      localStorage.setItem(ZOOM_KEY, String(next));
    } catch {
      // storage unavailable; zoom lasts for this visit
    }
  };
  return [zoom, setZoom] as const;
}

const DEFAULT_LEVELS_KEY = "checklista.defaultLevels";

/** Levels new questions start with; remembered per browser. */
function useDefaultLevels() {
  const [levels, setLevels] = useState<Level[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DEFAULT_LEVELS_KEY) ?? "null");
      const valid = Array.isArray(stored) ? LEVELS.filter((l) => stored.includes(l)) : [];
      return valid.length ? valid : [...LEVELS];
    } catch {
      return [...LEVELS];
    }
  });
  const set = (next: Level[]) => {
    setLevels(next);
    try {
      localStorage.setItem(DEFAULT_LEVELS_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable; the choice lasts for this visit
    }
  };
  return [levels, set] as const;
}

/** Floating zoom controls over the tree canvas. */
function ZoomBar({ zoom, setZoom, onFit }: { zoom: number; setZoom: (z: number) => void; onFit: () => void }) {
  const t = useT();
  return (
    <div
      className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-full border bg-card/95 px-2 py-1 shadow-lg backdrop-blur"
      role="group"
      aria-label={t("zoom.title")}
    >
      <Hint text={t("zoom.outHint")}>
        <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={t("zoom.out")} onClick={() => setZoom(zoom - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}>
          <ZoomOut className="size-4" />
        </Button>
      </Hint>
      <input
        type="range"
        aria-label={t("zoom.title")}
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={0.05}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        className="w-28 accent-primary"
      />
      <Hint text={t("zoom.inHint")}>
        <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={t("zoom.in")} onClick={() => setZoom(zoom + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>
          <ZoomIn className="size-4" />
        </Button>
      </Hint>
      <button
        type="button"
        className="w-12 rounded px-1 text-center text-xs tabular-nums text-muted-foreground hover:bg-muted"
        title={t("zoom.reset")}
        onClick={() => setZoom(1)}
      >
        {Math.round(zoom * 100)} %
      </button>
      <Hint text={t("zoom.fitHint")}>
        <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full" onClick={onFit}>
          <Maximize2 className="size-4" /> {t("zoom.fit")}
        </Button>
      </Hint>
    </div>
  );
}

/**
 * The main branch shrunk to an outline while a branch is shown big: the
 * questions of the main flow, with a chip per branch. Click it to go back.
 */
function MiniTree({
  items,
  laneNodes,
  current,
  label,
  onBack,
  onFocus,
}: {
  items: DraftItem[];
  laneNodes: { key: string; section: string; jumps: Record<string, string> }[];
  current: { start: number; end: number };
  label: (values: string[]) => string;
  onBack: () => void;
  onFocus: (owner: string, start: string) => void;
}) {
  const t = useT();
  const rows: React.ReactNode[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i]!;
    const split = lanesOf(laneNodes, i);
    const colors = split ? laneColors(split.lanes) : [];
    rows.push(
      <li key={item.key}>
        <p className="truncate">
          <span className="text-muted-foreground">{i + 1}.</span> {item.label || "—"}
        </p>
        {split && (
          <span className="mt-0.5 flex flex-wrap gap-1 pl-3">
            {split.lanes.map((l, k) => {
              const here = l.start === current.start && l.end === current.end;
              return (
                <button
                  key={l.start}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (items[l.start]) onFocus(item.key, items[l.start]!.key);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-1.5 text-[10px]",
                    colors[k]!.border,
                    here ? cn(colors[k]!.bg, "font-semibold ring-1 ring-current", colors[k]!.text) : "bg-card",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", colors[k]!.dot)} /> {label(l.values)}
                </button>
              );
            })}
          </span>
        )}
      </li>,
    );
    i = split ? split.merge : i + 1;
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onBack}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onBack()}
      title={t("flow.backToMain")}
      className="absolute right-4 top-4 z-10 max-h-64 w-64 cursor-pointer overflow-y-auto rounded-xl border bg-card/95 p-3 text-xs shadow-lg backdrop-blur hover:border-primary"
    >
      <p className="mb-1.5 flex items-center gap-1 font-semibold">
        <ArrowLeft className="size-3.5" /> {t("flow.mainBranch")}
      </p>
      <ol className="space-y-1">{rows}</ol>
    </div>
  );
}

/**
 * The whole tree as a nested list beside the canvas. Questions can be dragged
 * onto another question (before or after it, in its branch) or onto a branch
 * heading (last in that branch); clicking one shows it on the canvas.
 */
function TreeMenu({
  items,
  manage,
  dragKey,
  setDragKey,
  label,
  onMove,
  onShow,
}: {
  items: DraftItem[];
  manage: boolean;
  dragKey: string | null;
  setDragKey: (key: string | null) => void;
  label: (values: string[]) => string;
  onMove: (key: string, container: string, before: string | null) => void;
  onShow: (key: string) => void;
}) {
  const t = useT();
  const nodes = items.map((i) => ({ key: i.key, section: i.section, jumps: i.jumps }));
  const tree = buildTree(nodes);
  const number = new Map(items.map((i, n) => [i.key, n + 1]));
  const byKey = new Map(items.map((i) => [i.key, i]));
  // Drop marker: before a question, or at the end of a container.
  const [over, setOver] = useState<{ container: string; before: string | null } | null>(null);
  const drop = (e: React.DragEvent, container: string, before: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragKey && before !== dragKey) onMove(dragKey, container, before);
    setOver(null);
    setDragKey(null);
  };
  const dragOver = (e: React.DragEvent, container: string, before: string | null) => {
    if (!dragKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (over?.container !== container || over.before !== before) setOver({ container, before });
  };

  const list = (rows: TreeRow[], container: string, depth: number): React.ReactNode => (
    <ol className={cn("space-y-0.5", depth > 0 && "ml-3 border-l pl-2")}>
      {rows.map((r, n) => {
        const item = byKey.get(r.key)!;
        const below = rows[n + 1]?.key ?? null;
        const colors = laneColors(r.lanes);
        return (
          <li key={r.key}>
            {over?.container === container && over.before === r.key && <span className="block h-0.5 rounded bg-primary" />}
            <div
              draggable={manage}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", r.key);
                setDragKey(r.key);
              }}
              onDragEnd={() => {
                setDragKey(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                dragOver(e, container, e.clientY > box.top + box.height / 2 ? below : r.key);
              }}
              onDrop={(e) => drop(e, container, over?.container === container ? over.before : r.key)}
              onClick={() => onShow(r.key)}
              title={t("tree.dragHint")}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 hover:bg-muted",
                manage && "active:cursor-grabbing",
                dragKey === r.key && "opacity-40",
              )}
            >
              {manage && <GripVertical className="size-3 shrink-0 text-muted-foreground" />}
              <span className="shrink-0 text-muted-foreground tabular-nums">{number.get(r.key)}.</span>
              <span className="truncate">{item.label || "—"}</span>
            </div>
            {r.lanes.map((l, k) => (
              <div key={l.id} className="ml-3">
                <div
                  onDragOver={(e) => dragOver(e, l.id, null)}
                  onDrop={(e) => drop(e, l.id, null)}
                  className={cn(
                    "mt-0.5 flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold",
                    colors[k]!.text,
                    over?.container === l.id && over.before === null && "bg-primary/10 ring-1 ring-primary",
                  )}
                  title={t("tree.dropHere")}
                >
                  <span className={cn("size-2 rounded-full", colors[k]!.dot)} />
                  {t("flow.if")} {label(l.values)}
                </div>
                {list(l.rows, l.id, depth + 1)}
              </div>
            ))}
          </li>
        );
      })}
      <li
        onDragOver={(e) => dragOver(e, container, null)}
        onDrop={(e) => drop(e, container, null)}
        className={cn("h-2 rounded", over?.container === container && over.before === null && "h-1 bg-primary")}
      />
    </ol>
  );

  return (
    <div className="mt-2 max-h-[60vh] w-72 overflow-y-auto rounded-xl border bg-card/95 p-3 text-xs shadow-lg backdrop-blur">
      <p className="mb-1.5 font-semibold">{t("tree.main")}</p>
      {list(tree, MAIN, 0)}
    </div>
  );
}
