import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";
import { OrgPage, Spinner, EmptyState, type OrgContext } from "@/components/OrgPage";
import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Händelselogg — Checklista" }] }),
  component: () => <OrgPage>{(ctx) => <Audit ctx={ctx} />}</OrgPage>,
});

function Audit({ ctx }: { ctx: OrgContext }) {
  const t = useT();
  const data = useQuery({
    queryKey: ["audit", ctx.orgId],
    queryFn: async () => {
      const [{ data: log, error }, { data: profiles }] = await Promise.all([
        supabase.from("audit_log").select("*").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(300),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      if (error) throw error;
      const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || ""]));
      return (log ?? []).map((l) => ({ ...l, actor: l.actor_id ? names.get(l.actor_id) ?? "" : "" }));
    },
  });

  const describe = (meta: unknown) => {
    if (!meta || typeof meta !== "object") return "";
    const m = meta as Record<string, unknown>;
    return [m.title, m.reference, m.email].filter(Boolean).join(" · ");
  };

  return (
    <>
      <PageHeader title={t("audit.title")} />
      {data.isPending ? (
        <Spinner />
      ) : !data.data?.length ? (
        <EmptyState>{t("audit.empty")}</EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {data.data.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">
                  {t(`action.${l.action}`)} {describe(l.meta) && <span className="font-normal text-muted-foreground">— {describe(l.meta)}</span>}
                </p>
                <p className="text-xs text-muted-foreground">{l.actor}</p>
              </div>
              <time className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
