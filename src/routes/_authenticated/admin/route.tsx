import { useEffect, useRef } from "react";
import { createFileRoute, Link, Outlet, redirect, useLocation } from "@tanstack/react-router";
import {
  BarChart3,
  Users,
  FolderTree,
  ShieldAlert,
  Sparkles,
  Webhook,
  Car,
  MessageSquareHeart,
  Receipt,
  BadgeCheck,
  Inbox,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-user-roles";
import { useAdminOpenEventsCount } from "@/hooks/use-admin-events";
import { NativePageHeader } from "@/components/native-page-header";
import { CountBadge } from "@/components/ui/count-badge";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth", search: { mode: "signin" } });
    // limit(1), ikke maybeSingle(): en bruker med både admin- og
    // moderator-rad gir to rader, og maybeSingle() feiler da.
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "moderator"])
      .limit(1);
    if (!data?.length) throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof BarChart3;
  exact?: boolean;
  badge?: boolean;
};

// Moderatorer ser kun Moderasjon; alt annet er admin-only.
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Oversikt",
    items: [
      { to: "/admin", label: "Oversikt", icon: BarChart3, exact: true },
      { to: "/admin/hendelser", label: "Hendelser", icon: Inbox, badge: true },
    ],
  },
  {
    label: "Håndtering",
    items: [
      { to: "/admin/moderasjon", label: "Moderasjon", icon: ShieldAlert },
      { to: "/admin/bedrifter", label: "Bedrifter", icon: BadgeCheck },
      { to: "/admin/proff-abonnement", label: "Proff-abonnement", icon: Receipt },
      { to: "/admin/tilbakemeldinger", label: "Tilbakemeldinger", icon: MessageSquareHeart },
    ],
  },
  {
    label: "Innhold",
    items: [
      { to: "/admin/kategorier", label: "Kategorier", icon: FolderTree },
      { to: "/admin/kjoretoy", label: "Kjøretøy", icon: Car },
      { to: "/admin/promoteringer", label: "Fremhevinger", icon: Sparkles },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/admin/brukere", label: "Brukere", icon: Users },
      { to: "/admin/vipps-webhooks", label: "Vipps webhooks", icon: Webhook },
    ],
  },
];

function AdminLayout() {
  const { data: isAdmin } = useIsAdmin();
  const openEvents = useAdminOpenEventsCount();
  const navRef = useRef<HTMLElement>(null);
  const pathname = useLocation({ select: (l) => l.pathname });

  const groups = isAdmin
    ? NAV_GROUPS
    : [
        {
          label: "Håndtering",
          items: [{ to: "/admin/moderasjon", label: "Moderasjon", icon: ShieldAlert }],
        },
      ];

  // Pilleraden på mobil: hold aktivt element synlig, som i bedriftskonsollet.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia?.("(max-width: 1023px)").matches)
      return;
    const active = navRef.current?.querySelector<HTMLElement>('[data-status="active"]');
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [pathname]);

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-background">
      <NativePageHeader title="Administrasjon" backLabel="Meg" backTo="/meg" />
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-text">
            Administrasjon
          </p>
          <h1 className="mt-2 truncate font-display text-3xl tracking-tight sm:text-4xl">
            Kontrollpanel
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>{isAdmin ? "Administrator" : "Moderator"}</span>
            {isAdmin && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {openEvents === 0
                    ? "Ingen åpne hendelser"
                    : `${openEvents} ${openEvents === 1 ? "åpen hendelse" : "åpne hendelser"}`}
                </span>
              </>
            )}
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-safe py-6 sm:px-6 sm:py-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:px-8 lg:py-10">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:h-fit">
          <nav
            ref={navRef}
            aria-label="Administrasjon"
            className="flex w-full gap-1 overflow-x-auto lg:flex-col lg:gap-6 lg:overflow-visible"
          >
            {groups.map((group) => (
              <div key={group.label} className="contents lg:block">
                <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:block">
                  {group.label}
                </p>
                <div className="contents lg:flex lg:flex-col lg:gap-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      activeOptions={{ exact: item.exact }}
                      className="inline-flex min-h-12 shrink-0 items-center justify-start gap-3 whitespace-nowrap rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-primary/10 data-[status=active]:font-semibold data-[status=active]:text-primary lg:w-full"
                    >
                      <item.icon className="size-4" aria-hidden="true" />
                      {item.label}
                      {item.badge && openEvents > 0 && (
                        <>
                          <CountBadge count={openEvents} className="ml-auto" />
                          <span className="sr-only">, {openEvents} åpne</span>
                        </>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
