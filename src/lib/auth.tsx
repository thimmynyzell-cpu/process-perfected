import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type Organization = Database["public"]["Tables"]["organizations"]["Row"];

type SessionValue = { session: Session | null; loading: boolean };
const SessionContext = createContext<SessionValue>({ session: null, loading: true });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return (
    <SessionContext.Provider value={{ session, loading }}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

export type Membership = {
  orgId: string;
  role: AppRole;
  organization: Organization;
};

export function useMembership() {
  const { session, loading } = useSession();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: ["membership", userId],
    enabled: !loading && !!userId,
    queryFn: async (): Promise<Membership | null> => {
      await supabase.rpc("ensure_profile", { p_full_name: null });
      await supabase.rpc("accept_pending_invitations");

      const { data, error } = await supabase
        .from("org_members")
        .select("org_id, role, organizations(*)")
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      const row = data?.[0];
      if (!row || !row.organizations) return null;
      return {
        orgId: row.org_id,
        role: row.role,
        organization: row.organizations as Organization,
      };
    },
  });
}

export function canManage(role: AppRole | undefined) {
  return role === "admin" || role === "manager";
}

export async function logAudit(
  orgId: string,
  actorId: string,
  action: string,
  entity: string,
  entityId: string | null,
  meta: Record<string, unknown> = {},
) {
  await supabase.from("audit_log").insert({
    org_id: orgId,
    actor_id: actorId,
    action,
    entity,
    entity_id: entityId,
    meta: meta as never,
  });
}
