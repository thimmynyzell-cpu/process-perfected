import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, History, ListChecks, Smartphone } from "lucide-react";
import { useT } from "@/i18n";
import { useSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Checklista — repeterbara processer för kundservice" },
      {
        name: "description",
        content: "Bygg checklistor för kundservice, kör dem på mobilen och följ upp varje ärende.",
      },
      { property: "og:title", content: "Checklista — repeterbara processer för kundservice" },
      {
        property: "og:description",
        content: "Bygg checklistor för kundservice, kör dem på mobilen och följ upp varje ärende.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const t = useT();
  const { session } = useSession();
  const features = [
    { icon: ListChecks, title: t("landing.f1.title"), text: t("landing.f1.text") },
    { icon: Smartphone, title: t("landing.f2.title"), text: t("landing.f2.text") },
    { icon: History, title: t("landing.f3.title"), text: t("landing.f3.text") },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-display text-lg font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ListChecks className="size-4" />
          </span>
          {t("app.name")}
        </div>
        <Button asChild variant="ghost">
          <Link to={session ? "/dashboard" : "/auth"}>{t("landing.login")}</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-20 pt-12 md:pt-20">
        <div className="max-w-2xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            <CheckCircle2 className="size-3.5" /> {t("app.tagline")}
          </p>
          <h1 className="text-4xl font-semibold leading-tight md:text-6xl">
            {t("landing.heroTitle")}
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">{t("landing.heroText")}</p>
          <div className="mt-8 flex gap-3">
            <Button asChild size="lg">
              <Link to={session ? "/dashboard" : "/auth"}>{t("landing.cta")}</Link>
            </Button>
          </div>
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-6 shadow-soft">
              <f.icon className="size-5 text-primary" />
              <h2 className="mt-4 text-lg font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
