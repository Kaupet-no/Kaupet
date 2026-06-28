import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { BarChart3, Users, FolderTree, ShieldAlert, Sparkles, Webhook } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/lib/use-is-admin";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth", search: { mode: "signin" } });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "moderator"])
      .maybeSingle();
    if (!data) throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { data: isAdmin } = useIsAdmin();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl tracking-tight">Administrasjon</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin ? "Statistikk, brukere og kategorier" : "Moderasjon og varsler"}
        </p>
      </div>
      <nav className="mb-8 flex flex-wrap gap-2 border-b border-border">
        {isAdmin && (
          <>
            <NavTab to="/admin" icon={<BarChart3 className="size-4" />} label="Oversikt" exact />
            <NavTab to="/admin/brukere" icon={<Users className="size-4" />} label="Brukere" />
            <NavTab
              to="/admin/kategorier"
              icon={<FolderTree className="size-4" />}
              label="Kategorier"
            />
          </>
        )}
        <NavTab
          to="/admin/moderasjon"
          icon={<ShieldAlert className="size-4" />}
          label="Moderasjon"
          exact={!isAdmin}
        />
        {isAdmin && (
          <>
            <NavTab
              to="/admin/promoteringer"
              icon={<Sparkles className="size-4" />}
              label="Fremhevinger"
            />
            <NavTab
              to="/admin/vipps-webhooks"
              icon={<Webhook className="size-4" />}
              label="Vipps webhooks"
            />
          </>
        )}
      </nav>

      <Outlet />
    </div>
  );
}

function NavTab({
  to,
  icon,
  label,
  exact,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className="inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors data-[status=active]:border-primary data-[status=active]:text-foreground"
    >
      {icon}
      {label}
    </Link>
  );
}
