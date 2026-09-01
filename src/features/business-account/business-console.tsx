import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  ListChecks,
  Loader2,
  MessageCircle,
  Palette,
  Users,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BUSINESS_PLANS, hasEffectiveProffAccess } from "@/features/business-account/plans";
import type { BusinessOrganization } from "@/features/business-account/use-business-membership";
import { BusinessListingsPanel } from "@/features/business-account/business-listings-panel";
import { BusinessMessagesPanel } from "@/features/business-account/business-messages-panel";
import { BusinessProfileForm } from "@/features/business-account/business-profile-form";
import { MemberManagement } from "@/features/business-account/member-management";
import { setBusinessPlan } from "@/lib/business.functions";

export type BusinessTab = "oversikt" | "annonser" | "meldinger" | "bedriftsprofil" | "brukere";

type Props = {
  organization: BusinessOrganization;
  userId: string;
  tab: BusinessTab;
  onTabChange: (tab: BusinessTab) => void;
};

const TAB_LABELS: Record<BusinessTab, string> = {
  oversikt: "Oversikt",
  annonser: "Annonser",
  meldinger: "Meldinger",
  bedriftsprofil: "Bedriftsprofil",
  brukere: "Brukere",
};

export function BusinessConsole({ organization, userId, tab, onTabChange }: Props) {
  const queryClient = useQueryClient();
  const effectiveProff = hasEffectiveProffAccess(organization);
  const callSetPlan = useServerFn(setBusinessPlan);
  const [now] = useState(() => Date.now());
  const [planError, setPlanError] = useState<string | null>(null);
  const planMutation = useMutation({
    mutationFn: () => {
      setPlanError(null);
      return callSetPlan({ data: { plan: "proff_basis" } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business-membership"] });
    },
    onError: (error: Error) => setPlanError(error.message),
  });

  const plan = organization.selected_plan ? BUSINESS_PLANS[organization.selected_plan] : null;
  const trialEnded =
    organization.selected_plan === "proff" &&
    !!organization.proff_trial_ends_at &&
    new Date(organization.proff_trial_ends_at).getTime() <= now;
  const canCancelTrial =
    effectiveProff &&
    organization.selected_plan === "proff" &&
    !!organization.proff_trial_ends_at &&
    !organization.proff_trial_cancelled_at &&
    new Date(organization.proff_trial_ends_at).getTime() > now;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-safe py-6 sm:py-10">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Bedrift
        </p>
        <h1 className="mt-2 font-display text-3xl tracking-tight">{organization.display_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Org.nr. {organization.organization_number}
          {organization.city
            ? ` · ${organization.postal_code ? `${organization.postal_code} ` : ""}${organization.city}`
            : ""}
        </p>
      </div>

      <Tabs
        value={!effectiveProff && tab === "brukere" ? "oversikt" : tab}
        onValueChange={(value) => onTabChange(value as BusinessTab)}
      >
        <TabsList
          className="flex h-auto w-full flex-wrap justify-start gap-1"
          aria-label="Bedriftskonsoll"
        >
          {(Object.keys(TAB_LABELS) as BusinessTab[])
            .filter((value) => value !== "brukere" || effectiveProff)
            .map((value) => (
              <TabsTrigger key={value} value={value} className="min-h-9">
                {TAB_LABELS[value]}
              </TabsTrigger>
            ))}
        </TabsList>

        <TabsContent value="oversikt" className="mt-6">
          <Overview
            organization={organization}
            planName={plan?.name ?? "Ingen plan valgt"}
            effectiveProff={effectiveProff}
            trialEnded={trialEnded}
            planError={planError}
            canCancelTrial={canCancelTrial}
            planMutationPending={planMutation.isPending}
            planMutationSuccess={planMutation.isSuccess}
            onCancelTrial={() => planMutation.mutate()}
            onNavigate={onTabChange}
          />
        </TabsContent>
        <TabsContent value="annonser" className="mt-6">
          <BusinessListingsPanel organization={organization} />
        </TabsContent>
        <TabsContent value="meldinger" className="mt-6">
          <BusinessMessagesPanel organization={organization} />
        </TabsContent>
        <TabsContent value="bedriftsprofil" className="mt-6">
          <BusinessProfileForm organization={organization} />
        </TabsContent>
        <TabsContent value="brukere" className="mt-6">
          <MemberManagement organization={organization} userId={userId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Overview({
  organization,
  planName,
  effectiveProff,
  trialEnded,
  canCancelTrial,
  planError,
  planMutationPending,
  planMutationSuccess,
  onCancelTrial,
  onNavigate,
}: {
  organization: BusinessOrganization;
  planName: string;
  effectiveProff: boolean;
  trialEnded: boolean;
  canCancelTrial: boolean;
  planError: string | null;
  planMutationPending: boolean;
  planMutationSuccess: boolean;
  onCancelTrial: () => void;
  onNavigate: (tab: BusinessTab) => void;
}) {
  const trialEnd = organization.proff_trial_ends_at
    ? new Intl.DateTimeFormat("nb-NO", { dateStyle: "long" }).format(
        new Date(organization.proff_trial_ends_at),
      )
    : null;
  return (
    <section aria-labelledby="business-overview-title" className="space-y-6">
      <div>
        <h2 id="business-overview-title" className="font-display text-2xl tracking-tight">
          Oversikt
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan, tilgang og snarveier for bedriften.
        </p>
      </div>
      {planError && (
        <Alert variant="destructive">
          <AlertDescription>{planError}</AlertDescription>
        </Alert>
      )}
      {planMutationSuccess && (
        <Alert>
          <AlertDescription>Proff-prøveperioden er avsluttet.</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <CircleDollarSign className="size-4" /> Gjeldende plan
            </CardDescription>
            <CardTitle className="text-xl">{planName}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {organization.selected_plan === "proff_basis"
              ? "Gratis – alltid"
              : effectiveProff
                ? "Proff er aktiv"
                : "Proff er ikke aktiv"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <CalendarClock className="size-4" /> Prøveperiode
            </CardDescription>
            <CardTitle className="text-xl">{trialEnd ?? "Ikke startet"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {organization.proff_trial_cancelled_at
              ? "Avsluttet"
              : trialEnded
                ? "Utløpt"
                : effectiveProff
                  ? "Aktiv"
                  : "Ikke tilgjengelig"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Building2 className="size-4" /> Organisasjon
            </CardDescription>
            <CardTitle className="truncate text-xl">{organization.legal_name}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {organization.organization_number}
          </CardContent>
        </Card>
      </div>

      {canCancelTrial && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Avslutt prøveperioden</CardTitle>
            <CardDescription>
              Proff-funksjonene deaktiveres umiddelbart. Medlems- og profildata beholdes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">Avslutt prøveperioden</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Avslutte Proff-prøveperioden?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Dette kan ikke angres før betalingsløsningen er på plass. Logo, branding og
                    ekstra brukere blir utilgjengelige, men ingen data slettes.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Behold Proff</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(event) => {
                      event.preventDefault();
                      if (!planMutationPending) onCancelTrial();
                    }}
                  >
                    {planMutationPending && <Loader2 className="size-4 animate-spin" />}
                    {planMutationPending ? "Avslutter…" : "Avslutt prøveperioden"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <ConsoleLink
          icon={<ListChecks className="size-5" />}
          label="Administrer annonser"
          onClick={() => onNavigate("annonser")}
        />
        <ConsoleLink
          icon={<MessageCircle className="size-5" />}
          label="Se meldinger"
          onClick={() => onNavigate("meldinger")}
        />
        <ConsoleLink
          icon={<Palette className="size-5" />}
          label="Rediger bedriftsprofil"
          onClick={() => onNavigate("bedriftsprofil")}
        />
        {effectiveProff && (
          <ConsoleLink
            icon={<Users className="size-5" />}
            label="Administrer brukere"
            onClick={() => onNavigate("brukere")}
          />
        )}
      </div>
      {!effectiveProff && organization.selected_plan === "proff" && (
        <Alert variant="warning">
          <AlertDescription>
            {trialEnded || organization.proff_trial_cancelled_at
              ? "Prøveperioden er brukt. Proff kan aktiveres når betalingsløsningen er på plass."
              : "Proff-funksjonene er ikke aktive."}
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}

function ConsoleLink({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  );
}
