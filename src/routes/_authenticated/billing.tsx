import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useT } from "@/i18n";
import { PLANS, type PlanId } from "@/lib/plans";
import { OrgPage, type OrgContext } from "@/components/OrgPage";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Plan & fakturering — Checklista" }] }),
  component: () => <OrgPage>{(ctx) => <Billing ctx={ctx} />}</OrgPage>,
});

function Billing({ ctx }: { ctx: OrgContext }) {
  const t = useT();
  const current = ctx.organization.plan;
  return (
    <>
      <PageHeader title={t("billing.title")} description={t("billing.mock")} />
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(PLANS) as PlanId[]).map((id) => (
          <div
            key={id}
            className={cn("flex flex-col rounded-xl border bg-card p-5 shadow-soft", id === current && "border-primary ring-1 ring-primary")}
          >
            <h2 className="text-lg font-semibold">{t(`billing.${id}.name`)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t(`billing.${id}.desc`)}</p>
            <p className="mt-4 font-display text-3xl font-semibold">
              {PLANS[id].pricePerSeat} kr
              <span className="ml-1 text-xs font-normal text-muted-foreground">{t("billing.perSeat")}</span>
            </p>
            <div className="mt-auto pt-5">
              {id === current ? (
                <Button variant="outline" disabled className="w-full">
                  {t("billing.current")}
                </Button>
              ) : (
                <Button className="w-full" onClick={() => toast.info(t("billing.mock"))}>
                  {t("billing.upgrade")}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
