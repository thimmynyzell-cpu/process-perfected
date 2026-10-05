import { Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { useMembership, useSession, type Membership } from "@/lib/auth";

export type OrgContext = Membership & { userId: string };

export const nativeSelect =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Spinner() {
  return (
    <div className="flex justify-center py-16 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}

/** Loads the user's organization and wraps the page in the app shell. */
export function OrgPage({ children }: { children: (ctx: OrgContext) => ReactNode }) {
  const { session, loading } = useSession();
  const membership = useMembership();

  if (loading || membership.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  if (!membership.data) return <Navigate to="/onboarding" replace />;

  return <AppShell>{children({ ...membership.data, userId: session.user.id })}</AppShell>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
