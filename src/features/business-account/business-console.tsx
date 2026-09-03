import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  LayoutDashboard,
  ListChecks,
  Loader2,
  MapPin,
  MessageCircle,
  Palette,
  Users,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
import { Input } from "@/components/ui/input";
import type { BusinessMembership } from "@/features/business-account/use-business-membership";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BUSINESS_PLANS, hasEffectiveProffAccess } from "@/features/business-account/plans";
import type {
  BusinessLocation,
  BusinessOrganization,
} from "@/features/business-account/use-business-membership";
import { BusinessListingsPanel } from "@/features/business-account/business-listings-panel";
import { BusinessMessagesPanel } from "@/features/business-account/business-messages-panel";
import { BusinessProfileForm } from "@/features/business-account/business-profile-form";
import { MemberManagement } from "@/features/business-account/member-management";
import {
  getBusinessListingStats,
  setBusinessPlan,
  type BusinessListingStat,
} from "@/lib/business.functions";
import { BulkListingImport } from "@/features/listing-bulk-import/BulkListingImport";
import {
  DEFAULT_LISTING_VIEW_THRESHOLD,
  MAX_LISTING_VIEW_THRESHOLD,
  summarizeListingInsights,
} from "@/features/business-account/listing-insights";

export type BusinessTab = "oversikt" | "annonser" | "meldinger" | "bedriftsprofil" | "brukere";
type Props = {
  organization: BusinessOrganization;
  locations: BusinessLocation[];
  billingProfile: BusinessMembership["billingProfile"];
  selectedLocationId: string | "all";
  onLocationChange: (locationId: string | "all") => void;
  userId: string;
  role: "superuser" | "member";
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
const TAB_ICONS: Record<BusinessTab, typeof LayoutDashboard> = {
  oversikt: LayoutDashboard,
  annonser: ListChecks,
  meldinger: MessageCircle,
  bedriftsprofil: Palette,
  brukere: Users,
};
export function BusinessConsole({
  organization,
  locations,
  billingProfile,
  selectedLocationId,
  onLocationChange,
  userId,
  role,
  tab,
  onTabChange,
}: Props) {
  const [importOpen, setImportOpen] = useState(false);
  const queryClient = useQueryClient();
  const effectiveProff = hasEffectiveProffAccess(organization);
  const callSetPlan = useServerFn(setBusinessPlan);
  const loadBusinessListingStats = useServerFn(getBusinessListingStats);
  const businessListingStatsQuery = useQuery({
    queryKey: ["business-listing-stats", organization.id, userId, selectedLocationId, role],
    queryFn: () =>
      loadBusinessListingStats({
        data: {
          locationId: selectedLocationId === "all" ? null : selectedLocationId,
        },
      }),
  });
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
  const selectedLocation = locations.find((location) => location.id === selectedLocationId);
  const effectiveListingAccess =
    selectedLocation?.permissions.listingAccess ?? (role === "superuser" ? "all" : "own");
  const effectiveListingEditScope =
    selectedLocation?.permissions.listingEditScope ?? (role === "superuser" ? "all" : "none");

  const visibleTab =
    (!effectiveProff || role !== "superuser") && tab === "brukere" ? "oversikt" : tab;
  const tabsListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia?.("(max-width: 1023px)").matches)
      return;
    const activeTab = tabsListRef.current?.querySelector<HTMLElement>('[data-state="active"]');
    if (activeTab && typeof activeTab.scrollIntoView === "function") {
      activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [visibleTab]);
  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-background">
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-text">
              Bedriftskonsoll
            </p>
            <h1 className="mt-2 truncate font-display text-3xl tracking-tight sm:text-4xl">
              {organization.display_name}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span>Org.nr. {organization.organization_number}</span>
              <span aria-hidden="true">·</span>
              <span>{role === "superuser" ? "Superbruker" : "Medlem"}</span>
              {locations.length > 1 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{locations.length} lokasjoner</span>
                </>
              )}
            </p>
          </div>
          {locations.length > 1 && (
            <div className="w-full space-y-2 sm:w-72">
              <label
                htmlFor="business-location-context"
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <MapPin className="size-3.5" aria-hidden="true" />
                Arbeidsområde
              </label>
              <Select value={selectedLocationId} onValueChange={onLocationChange}>
                <SelectTrigger id="business-location-context" className="bg-background">
                  <SelectValue placeholder="Velg lokasjon" />
                </SelectTrigger>
                <SelectContent>
                  {role === "superuser" && <SelectItem value="all">Alle lokasjoner</SelectItem>}
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-safe py-6 sm:px-6 sm:py-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:px-8 lg:py-10">
        <Tabs
          value={visibleTab}
          onValueChange={(value) => onTabChange(value as BusinessTab)}
          className="contents"
        >
          <aside className="min-w-0 lg:sticky lg:top-24 lg:h-fit">
            <p className="mb-3 hidden px-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:block">
              Arbeidsflate
            </p>
            <TabsList
              ref={tabsListRef}
              className="!justify-start flex h-auto w-full gap-1 overflow-x-auto bg-transparent p-0 lg:flex-col lg:items-stretch"
              aria-label="Bedriftskonsoll"
            >
              {(Object.keys(TAB_LABELS) as BusinessTab[])
                .filter((value) => value !== "brukere" || (effectiveProff && role === "superuser"))
                .map((value) => {
                  const Icon = TAB_ICONS[value];
                  return (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="min-h-12 shrink-0 justify-start gap-3 rounded-lg px-3 text-sm text-muted-foreground data-[state=active]:bg-primary/10 data-[state=active]:font-semibold data-[state=active]:text-primary lg:w-full"
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {TAB_LABELS[value]}
                    </TabsTrigger>
                  );
                })}
            </TabsList>
          </aside>

          <div className="min-w-0">
            <TabsContent value="oversikt" className="mt-0">
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
                canManageMembers={role === "superuser"}
                listingStats={businessListingStatsQuery.data}
                listingStatsLoading={businessListingStatsQuery.isLoading}
                listingStatsError={businessListingStatsQuery.isError}
              />
            </TabsContent>
            <TabsContent value="annonser" className="mt-0">
              <BusinessListingsPanel
                organization={organization}
                locationId={selectedLocationId}
                userId={userId}
                listingAccess={effectiveListingAccess}
                listingEditScope={effectiveListingEditScope}
                canCreateListings={role === "superuser" || (effectiveProff && role === "member")}
                onImport={() => setImportOpen(true)}
              />
            </TabsContent>
            <TabsContent value="meldinger" className="mt-0">
              <BusinessMessagesPanel organization={organization} locationId={selectedLocationId} />
            </TabsContent>
            <TabsContent value="bedriftsprofil" className="mt-0">
              <BusinessProfileForm
                organization={organization}
                locations={locations}
                billingProfile={billingProfile}
              />
            </TabsContent>
            <TabsContent value="brukere" className="mt-0">
              <MemberManagement
                organization={organization}
                locations={locations}
                userId={userId}
                role={role}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
      {effectiveProff && (
        <BulkListingImport
          open={importOpen}
          onOpenChange={setImportOpen}
          locations={locations}
          selectedLocationId={selectedLocationId === "all" ? null : selectedLocationId}
        />
      )}
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
  canManageMembers,
  listingStats,
  listingStatsLoading,
  listingStatsError,
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
  canManageMembers: boolean;
  listingStats: BusinessListingStat[] | undefined;
  listingStatsLoading: boolean;
  listingStatsError: boolean;
}) {
  const trialEnd = organization.proff_trial_ends_at
    ? new Intl.DateTimeFormat("nb-NO", { dateStyle: "long" }).format(
        new Date(organization.proff_trial_ends_at),
      )
    : null;
  return (
    <section aria-labelledby="business-overview-title" className="space-y-8">
      <div className="max-w-2xl">
        <h2 id="business-overview-title" className="font-display text-3xl tracking-tight">
          Velkommen tilbake!
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Alt du trenger for å følge opp annonser, kjøpere og bedriftsprofilen – samlet på ett sted.
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

      <div className="grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-3 sm:divide-x sm:divide-border">
        <StatusCard
          icon={<CircleDollarSign className="size-4" />}
          label="Gjeldende plan"
          value={planName}
          detail={
            organization.selected_plan === "proff_basis"
              ? "Gratis – alltid"
              : effectiveProff
                ? "Proff er aktiv"
                : "Proff er ikke aktiv"
          }
          href="/bedrift/velg-plan"
          emphasized
        />
        <StatusCard
          icon={<CalendarClock className="size-4" />}
          label="Proff-tilgang"
          value={effectiveProff ? "Aktiv" : "Ikke aktiv"}
          detail={
            organization.selected_plan === "proff_basis"
              ? "Gratis plan"
              : trialEnd
                ? trialEnded
                  ? `Prøveperioden utløp ${trialEnd}`
                  : `Prøveperiode til ${trialEnd}`
                : effectiveProff
                  ? "Aktiv tilgang"
                  : "Ingen aktiv tilgang"
          }
          href="/bedrift/velg-plan"
        />
        <StatusCard
          icon={<Building2 className="size-4" />}
          label="Organisasjon"
          value={organization.legal_name}
          detail={organization.organization_number}
        />
      </div>
      <ListingInsights
        stats={listingStats}
        isLoading={listingStatsLoading}
        isError={listingStatsError}
      />

      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl tracking-tight">Neste handling</h3>
            <p className="mt-1 text-sm text-muted-foreground">Gå rett til det du skal gjøre nå.</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ConsoleLink
            icon={<ListChecks className="size-5" />}
            label="Administrer annonser"
            description="Rediger utkast og hold annonsene oppdaterte."
            onClick={() => onNavigate("annonser")}
          />
          <ConsoleLink
            icon={<MessageCircle className="size-5" />}
            label="Følg opp meldinger"
            description="Svar kjøpere mens interessen er fersk."
            onClick={() => onNavigate("meldinger")}
          />
          <ConsoleLink
            icon={<Palette className="size-5" />}
            label="Gjør profilen tydelig"
            description="Vis kjøperne hvem de handler med."
            onClick={() => onNavigate("bedriftsprofil")}
          />
          {effectiveProff && canManageMembers && (
            <ConsoleLink
              icon={<Users className="size-5" />}
              label="Administrer brukere"
              description="Fordel ansvar for annonser og meldinger."
              onClick={() => onNavigate("brukere")}
            />
          )}
        </div>
      </div>

      {canCancelTrial && (
        <div className="border-t border-border pt-6">
          <h3 className="text-base font-semibold">Avslutt prøveperioden</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Proff-funksjonene deaktiveres umiddelbart. Medlems- og profildata beholdes.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="mt-4">
                Avslutt prøveperioden
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Avslutte Proff-prøveperioden?</AlertDialogTitle>
                <AlertDialogDescription>
                  Dette kan ikke angres før betalingsløsningen er på plass. Logo, branding og ekstra
                  brukere blir utilgjengelige, men ingen data slettes.
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
        </div>
      )}

      {!effectiveProff && organization.selected_plan === "proff" && (
        <Alert variant="warning">
          <AlertDescription>
            {trialEnded || organization.proff_trial_cancelled_at ? (
              <>
                Prøveperioden er brukt.{" "}
                <Link to="/bedrift/velg-plan" className="underline underline-offset-4">
                  Bestill Proff
                </Link>{" "}
                for å fortsette med de betalte funksjonene.
              </>
            ) : (
              "Proff-funksjonene er ikke aktive."
            )}
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}

type ListingInsightsProps = {
  stats: BusinessListingStat[] | undefined;
  isLoading: boolean;
  isError: boolean;
};

function ListingInsights({ stats, isLoading, isError }: ListingInsightsProps) {
  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_LISTING_VIEW_THRESHOLD));
  const threshold = Number(thresholdInput);
  const validThreshold =
    /^\d{1,7}$/u.test(thresholdInput) &&
    Number.isInteger(threshold) &&
    threshold <= MAX_LISTING_VIEW_THRESHOLD;
  const summary = summarizeListingInsights(stats ?? [], validThreshold ? threshold : NaN);
  const formatter = new Intl.NumberFormat("nb-NO");

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Laster annonseinnsikt…
      </div>
    );
  }
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Kunne ikke laste annonseinnsikten. Prøv igjen senere.</AlertDescription>
      </Alert>
    );
  }

  const metrics = [
    {
      label: "Antall aktive annonser",
      value: summary.active,
      description: "Annonser som er synlige for kjøpere akkurat nå.",
      color: "text-primary",
    },
    {
      label: "Antall inaktive annonser",
      value: summary.inactive,
      description: "Utkast, solgte, deaktiverte, arkiverte eller utløpte annonser.",
      color: "text-brand-text",
    },
    {
      label: `Antall annonser med færre enn ${formatter.format(summary.threshold)} visninger`,
      value: summary.lowViews,
      description: "Annonser som kan ha nytte av en bedre tittel, pris eller synlighet.",
      color: "text-muted-foreground",
    },
  ];
  const total = Math.max((stats ?? []).length, 1);

  return (
    <section aria-labelledby="listing-insights-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-text">
            Innsikt
          </p>
          <h3 id="listing-insights-title" className="mt-1 font-display text-2xl tracking-tight">
            Slik går det med annonsene
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="listing-view-threshold" className="text-sm text-muted-foreground">
            Lav visningsterskel
          </label>
          <Input
            id="listing-view-threshold"
            type="number"
            min={0}
            max={1_000_000}
            step={1}
            value={thresholdInput}
            onChange={(event) => setThresholdInput(event.target.value)}
            aria-invalid={!validThreshold}
            aria-describedby="listing-view-threshold-help"
            className="w-24 bg-background text-right tabular-nums"
          />
        </div>
      </div>
      <p id="listing-view-threshold-help" className="text-sm text-muted-foreground">
        Juster tallet for å finne annonser som har fått lite oppmerksomhet. Bruk et helt tall mellom
        0 og 1 000 000.
      </p>
      {!validThreshold && (
        <p className="text-sm text-destructive" role="alert">
          Skriv inn et helt tall mellom 0 og 1 000 000.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
          >
            <MetricRing
              value={metric.value}
              percent={metric.value / total}
              color={metric.color}
              label={metric.label}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{metric.label}</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{metric.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricRing({
  value,
  percent,
  color,
  label,
}: {
  value: number;
  percent: number;
  color: string;
  label: string;
}) {
  const circumference = 2 * Math.PI * 46;
  const dash = Math.min(Math.max(percent, 0), 1) * circumference;
  return (
    <div className={`relative size-20 shrink-0 ${color}`} aria-label={`${label}: ${value}`}>
      <svg viewBox="0 0 112 112" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="56" cy="56" r="46" fill="none" className="stroke-muted" strokeWidth="10" />
        <circle
          cx="56"
          cy="56"
          r="46"
          fill="none"
          className="stroke-current"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}
function StatusCard({
  icon,
  label,
  value,
  detail,
  href,
  emphasized = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  href?: "/bedrift/velg-plan";
  emphasized?: boolean;
}) {
  const content = (
    <>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
        {href && (
          <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
        )}
      </p>
      <p className="mt-3 truncate text-lg font-semibold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </>
  );
  const className = `border-b border-border p-4 last:border-b-0 sm:border-b-0 sm:p-5 ${
    emphasized ? "bg-primary/[0.04]" : ""
  }`;

  return href ? (
    <Link
      to={href}
      className={`${className} block transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
      aria-label={`${label}: ${value}. Åpne plansammenligning`}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function ConsoleLink({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-20 w-full items-center gap-4 border-b border-border p-4 text-left transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-150 ease-out group-hover:translate-x-0.5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
    </button>
  );
}
