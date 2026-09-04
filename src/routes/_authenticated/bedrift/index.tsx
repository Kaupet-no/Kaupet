import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2 } from "lucide-react";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { NativePageHeader } from "@/components/native-page-header";
import { BusinessConsole, type BusinessTab } from "@/features/business-account/business-console";
import { useBusinessMembership } from "@/features/business-account/use-business-membership";
import { useAuth } from "@/hooks/use-auth";

const TABS: BusinessTab[] = [
  "oversikt",
  "annonser",
  "meldinger",
  "bedriftsprofil",
  "administrer",
  "brukere",
];

export const Route = createFileRoute("/_authenticated/bedrift/")({
  validateSearch: (search: Record<string, unknown>): { tab: BusinessTab; location?: string } => ({
    tab: TABS.includes(search.tab as BusinessTab) ? (search.tab as BusinessTab) : "oversikt",
    location:
      typeof search.location === "string" &&
      (search.location === "all" || z.string().uuid().safeParse(search.location).success)
        ? search.location
        : undefined,
  }),
  head: () => ({ meta: [{ title: "Bedriftskonsoll — Kaupet.no" }] }),
  component: BusinessConsoleRoute,
});

function BusinessConsoleRoute() {
  const navigate = useNavigate();
  const { tab, location } = Route.useSearch();
  const { user } = useAuth();
  const membershipQuery = useBusinessMembership();
  const membership = membershipQuery.data;
  const selectedLocationId =
    membership?.role === "superuser" && location === "all"
      ? "all"
      : (membership?.locations.find((candidate) => candidate.id === location)?.id ??
        membership?.locations.find((candidate) => candidate.is_default)?.id ??
        membership?.locations[0]?.id ??
        "all");

  if (membershipQuery.isLoading) {
    return (
      <>
        <NativePageHeader title="Bedriftskonsoll" backLabel="Meg" backTo="/meg" />
        <div
          className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin" /> Laster bedriftskonsollen…
        </div>
      </>
    );
  }

  if (membershipQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Kunne ikke laste bedriftskonsollen. Prøv igjen senere.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!membership || membership.status !== "active") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Alert>
          <AlertDescription>Du har ikke tilgang til bedriftskonsollen.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <>
      <BusinessConsole
        organization={membership.organization}
        locations={membership.locations}
        billingProfile={membership.billingProfile}
        selectedLocationId={selectedLocationId}
        onLocationChange={(nextLocationId) =>
          void navigate({
            to: "/bedrift",
            search: { tab, location: nextLocationId },
            replace: true,
          })
        }
        userId={user?.id ?? membership.user_id}
        role={membership.role}
        tab={tab}
        onTabChange={(nextTab) =>
          navigate({ to: "/bedrift", search: { tab: nextTab }, replace: true })
        }
      />
    </>
  );
}
