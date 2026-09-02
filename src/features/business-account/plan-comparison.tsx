import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatErrorMessage } from "@/lib/errors";
import { getOpenProffOrder, setBusinessPlan } from "@/lib/business.functions";
import { BusinessPlanLogo } from "./business-plan-logo";
import { ProffOrderDialog } from "./proff-order-dialog";
import { formatProffTermMonthlyEquivalent, formatProffTermPrice } from "./proff-pricing";
import {
  BUSINESS_PLANS,
  PROFF_TERMS,
  hasEffectiveProffAccess,
  type BusinessOrganizationEntitlement,
  type BusinessPlan,
  type BusinessPlanConfig,
  type BusinessPlanFeature,
  type ProffTerm,
} from "./plans";

export type PlanComparisonOrganization = BusinessOrganizationEntitlement & {
  proff_trial_started_at?: string | null;
  proff_trial_ends_at?: string | null;
  proff_trial_cancelled_at?: string | null;
};

export type PlanComparisonProps = {
  organization?: PlanComparisonOrganization | null;
  onSuccess?: (plan: BusinessPlan) => void;
  showSelection?: boolean;
};

const planOrder: BusinessPlan[] = ["proff_basis", "proff"];

function formatPrice(config: BusinessPlanConfig, term: ProffTerm) {
  if (config.monthlyPriceNok === 0) return "Gratis – alltid";
  return formatProffTermPrice(term);
}

function hasUsedTrial(organization: PlanComparisonOrganization | null | undefined) {
  return Boolean(organization?.proff_trial_started_at);
}

function FeatureStatus({ feature }: { feature: BusinessPlanFeature }) {
  return feature.included ? (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <span>{feature.value ?? "Ja"}</span>
      {feature.note && <span className="font-normal text-muted-foreground">({feature.note})</span>}
    </span>
  ) : (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground">
      <span aria-label={`Ikke inkludert: ${feature.label}`}>—</span>
      {feature.note && <span className="text-xs">{feature.note}</span>}
    </span>
  );
}

type PlanAction = { label: string; disabled: boolean; order?: boolean };

function planAction(
  plan: BusinessPlan,
  organization: PlanComparisonOrganization | null | undefined,
  hasOpenOrder: boolean,
): PlanAction {
  if (plan === "proff" && hasUsedTrial(organization) && !hasEffectiveProffAccess(organization)) {
    return hasOpenOrder
      ? { label: "Bestilling mottatt", disabled: true }
      : { label: "Bestill Proff", disabled: false, order: true };
  }

  if (organization?.selected_plan === plan) {
    return { label: "Valgt", disabled: true };
  }

  return {
    label: plan === "proff" ? "Start 30 dagers prøveperiode" : "Velg Proff basis",
    disabled: false,
  };
}

function PlanHeading({ config, term }: { config: BusinessPlanConfig; term: ProffTerm }) {
  const monthlyEquivalent =
    config.monthlyPriceNok > 0 ? formatProffTermMonthlyEquivalent(term) : null;
  return (
    <div className="space-y-6">
      <h3 className="sr-only">{config.name}</h3>
      <BusinessPlanLogo plan={config.id} />
      <div className="space-y-2 border-t border-border pt-6">
        <p className="font-display text-3xl tracking-tight tabular-nums">
          {formatPrice(config, term)}
        </p>
        <p className="min-h-10 text-sm text-muted-foreground">
          {[monthlyEquivalent, config.trialText].filter(Boolean).join(" · ") || (
            <span aria-hidden="true">&nbsp;</span>
          )}
        </p>
      </div>
    </div>
  );
}

export function PlanComparison({
  organization = null,
  onSuccess,
  showSelection = true,
}: PlanComparisonProps) {
  const [term, setTerm] = useState<ProffTerm>("monthly");
  const [orderOpen, setOrderOpen] = useState(false);
  const selectPlan = useServerFn(setBusinessPlan);
  const fetchOpenOrder = useServerFn(getOpenProffOrder);
  const openOrderQuery = useQuery({
    queryKey: ["proff-open-order"],
    queryFn: () => fetchOpenOrder(),
    enabled: showSelection,
    staleTime: 30_000,
  });
  const openOrder = openOrderQuery.data?.order ?? null;
  const mutation = useMutation({
    mutationFn: (plan: BusinessPlan) => selectPlan({ data: { plan } }),
    onSuccess: (_result, plan) => onSuccess?.(plan),
  });

  const errorMessage = mutation.error
    ? formatErrorMessage(mutation.error, "Kunne ikke lagre bedriftsplanen. Prøv igjen.")
    : null;
  const trialUsed = hasUsedTrial(organization) && !hasEffectiveProffAccess(organization);

  function choosePlan(plan: BusinessPlan) {
    if (mutation.isPending) return;
    if (planAction(plan, organization, openOrder !== null).order) {
      setOrderOpen(true);
      return;
    }
    mutation.reset();
    mutation.mutate(plan);
  }

  return (
    <section aria-labelledby="business-plan-heading" className="space-y-6">
      <div className="space-y-2">
        <h2 id="business-plan-heading" className="font-display text-2xl tracking-tight">
          Velg planen som passer deg og din bedrift.
        </h2>
      </div>
      {mutation.isPending && (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          Lagrer valgt plan…
        </p>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Betalingsperiode for Proff</legend>
        <RadioGroup
          className="flex flex-wrap gap-4"
          value={term}
          onValueChange={(value) => setTerm(value as ProffTerm)}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="monthly" id="proff-term-monthly" />
            <Label htmlFor="proff-term-monthly">Månedlig</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="yearly" id="proff-term-yearly" />
            <Label htmlFor="proff-term-yearly" className="flex items-center gap-2">
              Årlig
              <Badge variant="secondary">Spar {PROFF_TERMS.yearly.discountPct} %</Badge>
            </Label>
          </div>
        </RadioGroup>
      </fieldset>

      {openOrder && (
        <Alert role="status">
          <AlertDescription>
            Bestillingen er mottatt. Fakturaen sendes til {openOrder.billing_email}, og Proff
            aktiveres når betalingen er registrert.
          </AlertDescription>
        </Alert>
      )}
      {trialUsed && !openOrder && (
        <Alert role="status">
          <AlertDescription>
            Prøveperioden er brukt. Bestill Proff for å fortsette med de betalte funksjonene.
          </AlertDescription>
        </Alert>
      )}
      {errorMessage && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      {mutation.isSuccess && (
        <Alert role="status">
          <AlertDescription>Planen er lagret.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {planOrder.map((plan) => (
          <PlanCard
            key={plan}
            plan={plan}
            term={term}
            organization={organization}
            hasOpenOrder={openOrder !== null}
            isPending={mutation.isPending}
            showSelection={showSelection}
            onChoose={choosePlan}
          />
        ))}
      </div>

      <ProffOrderDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        term={term}
        onOrdered={() => openOrderQuery.refetch()}
      />
    </section>
  );
}

function PlanButton({
  plan,
  organization,
  hasOpenOrder,
  isPending,
  onChoose,
}: {
  plan: BusinessPlan;
  organization: PlanComparisonOrganization | null | undefined;
  hasOpenOrder: boolean;
  isPending: boolean;
  onChoose: (plan: BusinessPlan) => void;
}) {
  const action = planAction(plan, organization, hasOpenOrder);
  return (
    <Button
      type="button"
      className="mt-8 h-12 w-full"
      variant={plan === "proff" ? "default" : "outline"}
      disabled={action.disabled || isPending}
      aria-busy={isPending}
      onClick={() => onChoose(plan)}
    >
      {isPending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
      {isPending ? "Lagrer…" : action.label}
    </Button>
  );
}

function PlanCard({
  plan,
  term,
  organization,
  hasOpenOrder,
  isPending,
  showSelection,
  onChoose,
}: {
  plan: BusinessPlan;
  term: ProffTerm;
  organization: PlanComparisonOrganization | null | undefined;
  hasOpenOrder: boolean;
  isPending: boolean;
  showSelection: boolean;
  onChoose: (plan: BusinessPlan) => void;
}) {
  const config = BUSINESS_PLANS[plan];
  const isProff = plan === "proff";
  const isSelected = organization?.selected_plan === plan;
  return (
    <Card
      className={`relative overflow-hidden ${
        isProff
          ? "border-primary shadow-[0_16px_40px_-28px_var(--primary)]"
          : "border-border bg-surface/60"
      } ${isSelected ? "ring-2 ring-primary/20" : ""}`}
    >
      {isProff && <div className="h-1 bg-brand" aria-hidden="true" />}
      <CardHeader className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <PlanHeading config={config} term={term} />
          {isSelected && <Badge variant="secondary">Valgt</Badge>}
        </div>
        {showSelection && (
          <PlanButton
            plan={plan}
            organization={organization}
            hasOpenOrder={hasOpenOrder}
            isPending={isPending}
            onChoose={onChoose}
          />
        )}
      </CardHeader>
      <CardContent className="px-6 pb-6 sm:px-8 sm:pb-8">
        <ul className="space-y-4 border-t border-border pt-6">
          {config.features.map((feature) => (
            <li key={feature.label} className="space-y-1 text-sm">
              <div className="font-medium">{feature.label}</div>
              <FeatureStatus feature={feature} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
