import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { NativePageHeader } from "@/components/native-page-header";
import { PlanComparison } from "@/features/business-account/plan-comparison";

export const Route = createFileRoute("/_authenticated/bedrift/velg-plan")({
  head: () => ({ meta: [{ title: "Velg bedriftsplan — Kaupet.no" }] }),
  component: ChooseBusinessPlanPage,
});

function ChooseBusinessPlanPage() {
  const { organization } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  return (
    <>
      <NativePageHeader title="Velg bedriftsplan" hideBack />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-8 space-y-2">
          <p className="text-sm font-medium text-primary">{organization.display_name}</p>
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">
            Kom i gang med bedriften
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
