import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { getBusinessOrganization } from "@/lib/business/organization.functions";
import { showToast } from "@/lib/toast";

export const Route = createFileRoute("/_authenticated/bedrift")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw redirect({
        to: "/auth",
        search: { mode: "signin", returnTo: location.href },
      });
    }

    const businessOrganization = await getBusinessOrganization().catch(() => {
      // En privat konto kan ikke gjøres om — bedriftskonto opprettes ved
      // registrering. Si det, i stedet for å sende stille til forsiden.
      showToast(
        "info",
        "Bedriftssidene krever en bedriftskonto. Den opprettes ved registrering med organisasjonsnummer.",
      );
      throw redirect({ to: "/" });
    });
    const { organization, membership } = businessOrganization;

    if (organization.selected_plan === null && location.pathname !== "/bedrift/velg-plan") {
      throw redirect({ to: "/bedrift/velg-plan" });
    }

    return { organization, membership };
  },
  component: BusinessLayout,
});

function BusinessLayout() {
  return <Outlet />;
}
