import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Minus } from "lucide-react";

import { formatErrorMessage } from "@/lib/errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setBusinessPlan } from "@/lib/business.functions";
import {
  BUSINESS_PLANS,
  hasEffectiveProffAccess,
  type BusinessOrganizationEntitlement,
  type BusinessPlan,
  type BusinessPlanConfig,
  type BusinessPlanFeature,
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

function formatPrice(price: number) {
  if (price === 0) return "Gratis – alltid";
  return `${new Intl.NumberFormat("nb-NO").format(price)} kr per måned`;
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
      <Minus aria-hidden="true" className="size-4 shrink-0" />
      <span aria-label={`Ikke inkludert: ${feature.label}`}>—</span>
      {feature.note && <span className="text-xs">{feature.note}</span>}
    </span>
  );
}

function planAction(
  plan: BusinessPlan,
  organization: PlanComparisonOrganization | null | undefined,
) {
  if (organization?.selected_plan === plan) {
    return { label: "Valgt", disabled: true };
  }

  if (plan === "proff" && hasUsedTrial(organization) && !hasEffectiveProffAccess(organization)) {
    return { label: "Prøveperioden er brukt", disabled: true };
  }

  return {
    label: plan === "proff" ? "Start 30 dagers prøveperiode" : "Velg Proff basis",
    disabled: false,
  };
}

function PlanHeading({ config }: { config: BusinessPlanConfig }) {
  return (
    <div className="space-y-2">
      <CardTitle className="text-xl">{config.name}</CardTitle>
      <p className="font-display text-2xl tracking-tight tabular-nums">
        {formatPrice(config.monthlyPriceNok)}
      </p>
      {config.trialText && <p className="text-sm text-muted-foreground">{config.trialText}</p>}
    </div>
  );
}

export function PlanComparison({
  organization = null,
  onSuccess,
  showSelection = true,
}: PlanComparisonProps) {
  const selectPlan = useServerFn(setBusinessPlan);
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
    mutation.reset();
    mutation.mutate(plan);
  }

  return (
    <section aria-labelledby="business-plan-heading" className="space-y-6">
      <div className="space-y-2">
        <h2 id="business-plan-heading" className="font-display text-2xl tracking-tight">
          Velg bedriftsplan
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Velg planen som passer bedriften. Du kan bruke Proff umiddelbart i prøveperioden; betaling
          innkreves ikke før en separat betalingsløsning er lansert.
        </p>
      </div>
      {mutation.isPending && (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          Lagrer valgt plan…
        </p>
      )}

      {trialUsed && (
        <Alert role="status">
          <AlertDescription>
            Prøveperioden er brukt. Proff kan aktiveres når betalingsløsningen er på plass.
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

      <div className="hidden overflow-hidden rounded-xl border md:block">
        <Table>
          <caption className="sr-only">Sammenligning av Proff basis og Proff</caption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[45%]">Funksjon</TableHead>
              {planOrder.map((plan) => (
                <TableHead key={plan} className="min-w-44 align-top">
                  <PlanHeading config={BUSINESS_PLANS[plan]} />
                  {showSelection && (
                    <PlanButton
                      plan={plan}
                      organization={organization}
                      isPending={mutation.isPending}
                      onChoose={choosePlan}
                    />
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {BUSINESS_PLANS.proff_basis.features.map((feature, index) => (
              <TableRow key={feature.label}>
                <TableHead scope="row" className="font-medium text-foreground">
                  {feature.label}
                </TableHead>
                {planOrder.map((plan) => (
                  <TableCell key={plan} className="align-top">
                    <FeatureStatus feature={BUSINESS_PLANS[plan].features[index]} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-4 md:hidden">
        {planOrder.map((plan) => (
          <PlanCard
            key={plan}
            plan={plan}
            organization={organization}
            isPending={mutation.isPending}
            showSelection={showSelection}
            onChoose={choosePlan}
          />
        ))}
      </div>
    </section>
  );
}

function PlanButton({
  plan,
  organization,
  isPending,
  onChoose,
}: {
  plan: BusinessPlan;
  organization: PlanComparisonOrganization | null | undefined;
  isPending: boolean;
  onChoose: (plan: BusinessPlan) => void;
}) {
  const action = planAction(plan, organization);
  return (
    <Button
      type="button"
      className="mt-4 w-full"
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
  organization,
  isPending,
  showSelection,
  onChoose,
}: {
  plan: BusinessPlan;
  organization: PlanComparisonOrganization | null | undefined;
  isPending: boolean;
  showSelection: boolean;
  onChoose: (plan: BusinessPlan) => void;
}) {
  const config = BUSINESS_PLANS[plan];
  const isSelected = organization?.selected_plan === plan;
  return (
    <Card className={isSelected ? "border-primary" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <PlanHeading config={config} />
          {isSelected && <Badge variant="secondary">Valgt</Badge>}
        </div>
        {showSelection && (
          <PlanButton
            plan={plan}
            organization={organization}
            isPending={isPending}
            onChoose={onChoose}
          />
        )}
      </CardHeader>
      <CardContent>
        <ul className="space-y-4 border-t pt-4">
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
