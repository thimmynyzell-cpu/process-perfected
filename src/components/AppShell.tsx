import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ListChecks,
  PlayCircle,
  History,
  Users,
  Settings,
  CreditCard,
  ScrollText,
  LogOut,
  Menu,
  Moon,
  Sun,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, useT, locales } from "@/i18n";
import { useTheme } from "@/lib/theme";
import { useMembership } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", icon: LayoutDashboard, key: "nav.dashboard" },
  { to: "/templates", icon: ListChecks, key: "nav.templates" },
  { to: "/runs/new", icon: PlayCircle, key: "nav.run" },
  { to: "/history", icon: History, key: "nav.history" },
  { to: "/team", icon: Users, key: "nav.team" },
  { to: "/audit", icon: ScrollText, key: "nav.audit" },
  { to: "/billing", icon: CreditCard, key: "nav.billing" },
  { to: "/settings", icon: Settings, key: "nav.settings" },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const t = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname === item.to || pathname.startsWith(item.to + "/");
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="size-4" />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarInner({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const { theme, toggle } = useTheme();
  const { data: membership } = useMembership();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-3 px-1">
        {membership?.organization.logo_url ? (
          <img
            src={membership.organization.logo_url}
            alt=""
            className="size-9 rounded-lg object-cover"
          />
        ) : (
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ListChecks className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {membership?.organization.name ?? t("app.name")}
          </p>
          <p className="text-xs text-muted-foreground">{t(`role.${membership?.role ?? "agent"}`)}</p>
        </div>
      </div>

      <NavLinks onNavigate={onNavigate} />

      <div className="mt-auto space-y-2 border-t pt-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={toggle} className="flex-1 justify-start gap-2">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {theme === "dark" ? t("common.light") : t("common.dark")}
          </Button>
          <select
            aria-label={t("common.language")}
            value={locale}
            onChange={(e) => setLocale(e.target.value as typeof locale)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {locales.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start gap-2">
          <LogOut className="size-4" />
          {t("nav.signOut")}
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = useT();

  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[16rem_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen border-r bg-sidebar md:block">
        <SidebarInner />
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b bg-background/85 px-4 py-3 backdrop-blur md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Meny">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SidebarInner onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="font-display text-base font-semibold">{t("app.name")}</span>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="no-print flex gap-2">{action}</div> : null}
    </div>
  );
}
