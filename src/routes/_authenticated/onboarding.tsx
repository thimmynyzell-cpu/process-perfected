import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";
import { useMembership } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/OrgPage";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Skapa organisation — Checklista" }] }),
  component: Onboarding,
});

function Onboarding() {
  const t = useT();
  const membership = useMembership();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (membership.isPending) return <Spinner />;
  if (membership.data) return <Navigate to="/dashboard" replace />;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("create_organization", { p_name: name });
    setBusy(false);
    if (error) return toast.error(error.message);
    await queryClient.invalidateQueries({ queryKey: ["membership"] });
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={create} className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-soft">
        <h1 className="text-xl font-semibold">{t("onboarding.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("onboarding.subtitle")}</p>
        <div className="mt-6 space-y-1.5">
          <Label htmlFor="org">{t("onboarding.orgName")}</Label>
          <Input id="org" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button className="mt-4 w-full" disabled={busy}>
          {t("onboarding.create")}
        </Button>
      </form>
    </div>
  );
}
