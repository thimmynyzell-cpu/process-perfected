import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, locales } from "@/i18n";
import { useTheme } from "@/lib/theme";
import { OrgPage, nativeSelect, type OrgContext } from "@/components/OrgPage";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Inställningar — Checklista" }] }),
  component: () => <OrgPage>{(ctx) => <Settings ctx={ctx} />}</OrgPage>,
});

function Settings({ ctx }: { ctx: OrgContext }) {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const [name, setName] = useState(ctx.organization.name);
  const [logo, setLogo] = useState(ctx.organization.logo_url ?? "");
  const isAdmin = ctx.role === "admin";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase
      .from("organizations")
      .update({ name: name.trim(), logo_url: logo.trim() || null })
      .eq("id", ctx.orgId);
    if (error) { toast.error(error.message); return; }
    toast.success(t("settings.saved"));
    qc.invalidateQueries({ queryKey: ["membership"] });
  }

  return (
    <>
      <PageHeader title={t("settings.title")} />
      <div className="grid gap-6 md:grid-cols-2">
        <form onSubmit={save} className="space-y-4 rounded-xl border bg-card p-5 shadow-soft">
          <fieldset disabled={!isAdmin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">{t("settings.orgName")}</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="logo">{t("settings.logoUrl")}</Label>
              <Input id="logo" type="url" value={logo} onChange={(e) => setLogo(e.target.value)} />
            </div>
            <Button type="submit">{t("common.save")}</Button>
          </fieldset>
        </form>

        <div className="space-y-4 rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="font-semibold">{t("settings.appearance")}</h2>
          <div className="space-y-1.5">
            <Label>{t("common.theme")}</Label>
            <select className={nativeSelect} value={theme} onChange={(e) => setTheme(e.target.value as "light" | "dark")}>
              <option value="light">{t("common.light")}</option>
              <option value="dark">{t("common.dark")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.language")}</Label>
            <select className={nativeSelect} value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)}>
              {locales.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </>
  );
}
