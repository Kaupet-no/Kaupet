import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (error.name === "AuthSessionMissingError") return {};
      throw redirect({ to: "/auth", search: { mode: "signin" } });
    }
    if (!data.user) throw redirect({ to: "/auth", search: { mode: "signin" } });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
