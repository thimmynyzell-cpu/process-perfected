import { CircleCheck, CirclePlay, GitBranch } from "lucide-react";
import { useT } from "@/i18n";
import type { FlowNode } from "@/lib/flow";
import { branchValues } from "@/lib/flow";
import { cn } from "@/lib/utils";

export function FlowTree({ nodes, onSelect }: { nodes: FlowNode[]; onSelect?: (key: string) => void }) {
  const t = useT();
  if (!nodes.length) return <p className="text-sm text-muted-foreground">{t("flow.empty")}</p>;
  const roots = nodes.filter((n) => !n.parentKey || !nodes.some((p) => p.key === n.parentKey));
  return (
    <div className="space-y-0">
      <Terminal icon={<CirclePlay className="size-4" />} label={t("flow.start")} />
      <Chain nodes={roots} all={nodes} onSelect={onSelect} />
      <Terminal icon={<CircleCheck className="size-4" />} label={t("flow.end")} />
    </div>
  );
}

function Terminal({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</span>
      {label}
    </div>
  );
}

function Chain({ nodes, all, onSelect }: { nodes: FlowNode[]; all: FlowNode[]; onSelect?: (key: string) => void }) {
  return (
    <ol className="ml-3.5 border-l-2 border-border py-2 pl-5">
      {nodes.map((n) => (
        <NodeView key={n.key} node={n} all={all} onSelect={onSelect} />
      ))}
    </ol>
  );
}

function NodeView({ node, all, onSelect }: { node: FlowNode; all: FlowNode[]; onSelect?: (key: string) => void }) {
  const t = useT();
  const children = all.filter((c) => c.parentKey === node.key);
  const values = branchValues(node.type, node.options);
  const label = (v: string) => (node.type === "checkbox" ? (v === "true" ? t("flow.yes") : t("flow.no")) : v);
  const branches = values.map((v) => ({ v, items: children.filter((c) => c.showWhen === v) })).filter((b) => b.items.length);
  return (
    <li className="relative py-1.5">
      <span className="absolute -left-[27px] top-4 size-3 rounded-full border-2 border-primary bg-background" />
      <div
        className={cn(
          "rounded-lg border bg-card px-3 py-2 shadow-soft",
          onSelect && "cursor-pointer transition-colors hover:border-primary hover:bg-primary/5",
        )}
        onClick={() => onSelect?.(node.key)}
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onKeyDown={onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(node.key); } } : undefined}
      >
        <p className="text-sm font-medium">
          {node.label || "—"}
          {node.required && <span className="ml-1 text-destructive">*</span>}
        </p>
        <p className="text-xs text-muted-foreground">{t(`itemType.${node.type}` as never)}</p>
      </div>
      {branches.length > 0 && (
        <div className="mt-2 space-y-2 pl-4">
          {branches.map((b) => (
            <div key={b.v} className="rounded-lg border border-dashed p-2">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <GitBranch className="size-3.5 text-primary" />
                {t("flow.if")}
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5",
                    node.type === "checkbox" && b.v === "false" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
                  )}
                >
                  {label(b.v)}
                </span>
              </div>
              <Chain nodes={b.items} all={all} onSelect={onSelect} />
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
