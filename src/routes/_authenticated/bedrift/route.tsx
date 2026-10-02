import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { getBusinessOrganization } from "@/lib/business/organization.functions";
import { formatErrorMessage } from "@/lib/errors";
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

    const businessOrganization = await getBusinessOrganization().catch((e: unknown) => {
      // En privat konto kan ikke gjøres om — bedriftskonto opprettes ved
      // registrering. Si det, i stedet for å sende stille til forsiden.
      // Meldingen er UNAUTHORIZED_MESSAGE i organization-access.ts (server-
      // modul, kan ikke importeres her); andre feil får en vanlig feilmelding.
      const noBusinessAccount =
        e instanceof Error && e.message.includes("ikke tilgang til bedriftskontoen");
      if (noBusinessAccount) {
        showToast(
          "info",
          "Bedriftssidene krever en bedriftskonto. Den opprettes ved registrering med organisasjonsnummer.",
        );
      } else {
        showToast("error", formatErrorMessage(e, "Kunne ikke laste bedriftskontoen."));
      }
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
