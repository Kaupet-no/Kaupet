import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { NativePageHeader } from "@/components/native-page-header";
import { BusinessConsole, type BusinessTab } from "@/features/business-account/business-console";
import { useBusinessMembership } from "@/features/business-account/use-business-membership";
import { useAuth } from "@/hooks/use-auth";

const TABS: BusinessTab[] = ["oversikt", "annonser", "meldinger", "bedriftsprofil", "brukere"];

export const Route = createFileRoute("/_authenticated/bedrift/")({
  validateSearch: (search: Record<string, unknown>): { tab: BusinessTab } => ({
    tab: TABS.includes(search.tab as BusinessTab) ? (search.tab as BusinessTab) : "oversikt",
  }),
  head: () => ({ meta: [{ title: "Bedriftskonsoll — Kaupet.no" }] }),
  component: BusinessConsoleRoute,
});

function BusinessConsoleRoute() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tab } = Route.useSearch();
  const membershipQuery = useBusinessMembership();
  const membership = membershipQuery.data;

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
      <NativePageHeader title="Bedriftskonsoll" backLabel="Meg" backTo="/meg" />
      <BusinessConsole
        organization={membership.organization}
        userId={user?.id ?? membership.user_id}
        role={membership.role}
        listingAccess={membership.listing_access}
        listingEditScope={membership.listing_edit_scope}
        tab={tab}
        onTabChange={(nextTab) =>
          void navigate({ to: "/bedrift", search: { tab: nextTab }, replace: true })
        }
      />
    </>
  );
}
