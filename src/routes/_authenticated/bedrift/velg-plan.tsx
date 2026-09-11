import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NativePageHeader } from "@/components/native-page-header";
import { PlanComparison } from "@/features/business-account/plan-comparison";
import { useIsNative } from "@/hooks/use-is-native";

export function shouldShowPlanBackButton(selectedPlan: string | null) {
  return selectedPlan !== null;
}

export const Route = createFileRoute("/_authenticated/bedrift/velg-plan")({
  head: () => ({ meta: [{ title: "Velg bedriftsplan — Kaupet.no" }] }),
  component: ChooseBusinessPlanPage,
});

function ChooseBusinessPlanPage() {
  const { organization } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const native = useIsNative();
  const hasSelectedPlan = shouldShowPlanBackButton(organization.selected_plan);
  return (
    <>
      <NativePageHeader
        title="Velg bedriftsplan"
        backLabel="Bedriftskonsoll"
        backTo="/bedrift"
        hideBack={!hasSelectedPlan}
      />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
        {hasSelectedPlan && !native && (
          <Button asChild variant="ghost" className="mb-6 -ml-3">
            <Link to="/bedrift" search={{ tab: "oversikt" }}>
              <ChevronLeft className="size-4" aria-hidden="true" />
              Tilbake til bedriftskonsollet
            </Link>
          </Button>
        )}
        <div className="mb-8 space-y-2">
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">
            Velkommen til Kaupet Proff.
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Velg en plan for å åpne bedriftskontoen. Du kan bytte plan senere dersom behovene endrer
            seg.
          </p>
        </div>
        <PlanComparison
          organization={organization}
          onSuccess={async () => {
            await queryClient.invalidateQueries({ queryKey: ["business-membership"] });
            await navigate({ to: "/bedrift", search: { tab: "oversikt" } });
          }}
        />
      </main>
    </>
  );
}
