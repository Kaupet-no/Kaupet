import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { getBusinessOrganization } from "@/lib/business.functions";

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
