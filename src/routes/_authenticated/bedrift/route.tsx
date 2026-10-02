import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { getBusinessOrganization } from "@/lib/business/organization.functions";
import { UNAUTHORIZED_MESSAGE } from "@/lib/business/schemas";
import { formatErrorMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";

export const Route = createFileRoute("/_authenticated/bedrift")({
  ssr: false,
  beforeLoad: async ({ location, preload }) => {
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
      // Gjelder også deaktiverte medlemmer; andre feil får en vanlig feilmelding.
      // Ikke ved forhåndslasting (hover over lenken): da navigerer ingen ennå.
      if (preload) throw redirect({ to: "/" });
      if (e instanceof Error && e.message === UNAUTHORIZED_MESSAGE) {
        showToast(
          "info",
          "Du har ikke tilgang til en bedriftskonto. Bedriftskonto opprettes ved registrering med organisasjonsnummer.",
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
