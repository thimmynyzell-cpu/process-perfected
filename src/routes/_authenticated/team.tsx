import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";
import { canManage, logAudit, type AppRole } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { OrgPage, Spinner, nativeSelect, type OrgContext } from "@/components/OrgPage";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ROLES: AppRole[] = ["admin", "manager", "agent"];

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Team — Checklista" }] }),
  component: () => <OrgPage>{(ctx) => <Team ctx={ctx} />}</OrgPage>,
});

function Team({ ctx }: { ctx: OrgContext }) {
  const t = useT();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("agent");
  const isAdmin = ctx.role === "admin";
  const manage = canManage(ctx.role);

  const data = useQuery({
    queryKey: ["team", ctx.orgId],
    queryFn: async () => {
      const [{ data: members, error }, { data: profiles }, { data: invites }] = await Promise.all([
        supabase.from("org_members").select("*").eq("org_id", ctx.orgId).order("created_at"),
        supabase.from("profiles").select("*"),
        manage
          ? supabase.from("invitations").select("*").eq("org_id", ctx.orgId).eq("status", "pending")
          : Promise.resolve({ data: [] as never[] }),
      ]);
      if (error) throw error;
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return {
        members: (members ?? []).map((m) => ({ ...m, profile: byId.get(m.user_id) })),
        invites: invites ?? [],
      };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["team", ctx.orgId] });
  const members = data.data?.members ?? [];
  const invites = data.data?.invites ?? [];
  const maxSeats = PLANS[ctx.organization.plan].maxSeats;
  const total = maxSeats ?? Math.max(ctx.organization.seats, members.length);
  const used = members.length + invites.length;
  const full = maxSeats !== null && used >= maxSeats;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (full) return;
    const { data: inv, error } = await supabase
      .from("invitations")
      .insert({ org_id: ctx.orgId, email: email.trim().toLowerCase(), role, invited_by: ctx.userId })
      .select()
      .single();
    if (error) return toast.error(error.message);
    await logAudit(ctx.orgId, ctx.userId, "member.invited", "invitation", inv.id, { email: inv.email });
    toast.success(t("team.inviteSent"));
    setEmail("");
    refresh();
  }

  async function changeRole(id: string, next: AppRole) {
    const { error } = await supabase.from("org_members").update({ role: next }).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  }

  async function removeMember(id: string) {
    const { error } = await supabase.from("org_members").delete().eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  }

  async function removeInvite(id: string) {
    await supabase.from("invitations").delete().eq("id", id);
    refresh();
  }

  return (
    <>
      <PageHeader title={t("team.title")} description={t("team.seatsUsed", { used, total })} />

      {manage && (
        <div className="mb-6 rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="mb-3 font-semibold">{t("team.invite")}</h2>
          {full ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              {t("limit.seats", { max: maxSeats ?? 0 })}
              <Button asChild size="sm" variant="outline">
                <Link to="/billing">{t("limit.upgradeCta")}</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={invite} className="grid gap-2 md:grid-cols-[1fr_12rem_auto]">
              <Input
                type="email"
                required
                placeholder={t("team.inviteEmail")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <select className={nativeSelect} value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
                {ROLES.filter((r) => isAdmin || r !== "admin").map((r) => (
                  <option key={r} value={r}>
                    {t(`role.${r}`)}
                  </option>
                ))}
              </select>
              <Button type="submit">{t("team.invite")}</Button>
            </form>
          )}
        </div>
      )}

      {data.isPending ? (
        <Spinner />
      ) : (
        <>
          <h2 className="mb-2 font-semibold">{t("team.members")}</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {m.profile?.full_name || m.profile?.email || m.user_id.slice(0, 8)}
                    {m.user_id === ctx.userId && (
                      <span className="ml-1 text-xs text-muted-foreground">({t("team.you")})</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{m.profile?.email}</p>
                </div>
                {isAdmin && m.user_id !== ctx.userId ? (
                  <div className="flex items-center gap-2">
                    <select
                      className={`${nativeSelect} w-40`}
                      value={m.role}
                      onChange={(e) => changeRole(m.id, e.target.value as AppRole)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`role.${r}`)}
                        </option>
                      ))}
                    </select>
                    <Button size="icon" variant="ghost" aria-label={t("team.remove")} onClick={() => removeMember(m.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">{t(`role.${m.role}`)}</span>
                )}
              </li>
            ))}
          </ul>

          {invites.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 font-semibold">{t("team.pending")}</h2>
              <ul className="divide-y rounded-xl border bg-card">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-medium">{i.email}</p>
                      <p className="text-xs text-muted-foreground">{t(`role.${i.role}`)}</p>
                    </div>
                    <Button size="icon" variant="ghost" aria-label={t("team.remove")} onClick={() => removeInvite(i.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}
