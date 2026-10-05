import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export function RunStatusBadge({ status, dueAt }: { status: string; dueAt?: string | null }) {
  const t = useT();
  const overdue = status === "in_progress" && dueAt && new Date(dueAt).getTime() < Date.now();
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "completed"
          ? "bg-success/15 text-success"
          : overdue
            ? "bg-destructive/15 text-destructive"
            : "bg-warning/20 text-warning-foreground",
      )}
    >
      {status === "completed" ? t("run.completed") : overdue ? t("dashboard.overdue") : t("run.inProgress")}
    </span>
  );
}
