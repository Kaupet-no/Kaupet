import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, MessageCircle, Plus, LogIn, Home } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/lib/auth";
import { useUnreadConversationsCount } from "@/lib/use-unread";
import { useIsAdmin } from "@/lib/use-is-admin";
import { hapticImpact } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NotificationsBell } from "@/components/notifications-bell";

function initials(name: string | null | undefined, fallback: string) {
  const source = (name ?? fallback).trim();
  if (!source) return "?";
  const parts = source.split(/\s+/u).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function AppBottomNav() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unread = useUnreadConversationsCount();
  const [userOpen, setUserOpen] = useState(false);

  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 px-3 pointer-events-none"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
    >
      <div className="pointer-events-auto mx-auto flex max-w-md items-end justify-around gap-1 rounded-3xl border border-border bg-background/95 px-3 pb-3 pt-3 shadow-xl backdrop-blur">
        {/* Hjem */}
        <Link
          to="/"
          className="flex flex-1 flex-col items-center gap-0.5"
          aria-label="Hjem"
        >
          <span className="flex h-11 w-11 items-center justify-center">
            {isActive("/") && pathname === "/" ? (
              <span className="font-display text-2xl font-semibold leading-none text-primary">
                k<span className="text-accent">.</span>
              </span>
            ) : (
              <Home className="size-6 text-muted-foreground" />
            )}
          </span>
          <span
            className={`text-[11px] ${pathname === "/" ? "font-medium text-primary" : "text-muted-foreground"}`}
          >
            Hjem
          </span>
        </Link>

        {/* Varsler */}
        <div className="flex flex-1 flex-col items-center gap-0.5">
          {user ? (
            <div className="relative flex h-11 w-11 items-center justify-center">
              <NotificationsBell />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate({ to: "/auth" })}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground"
              aria-label="Varsler (logg inn)"
            >
              <Bell className="size-6" />
            </button>
          )}
          <span className="text-[11px] text-muted-foreground">Varsler</span>
        </div>

        {/* Ny annonse (FAB) — midten */}
        <div className="-mt-7 flex flex-1 flex-col items-center gap-0.5">
          <Link
            to={user ? "/ny-annonse" : "/auth"}
            search={user ? undefined : { mode: "signup" as const }}
            aria-label="Ny annonse"
            onClick={() => void hapticImpact("light")}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition active:scale-95"
          >
            <Plus className="size-8" />
          </Link>
          <span className="text-[11px] text-muted-foreground">Selg</span>
        </div>

        {/* Meldinger */}
        <Link
          to="/meldinger"
          className="flex flex-1 flex-col items-center gap-0.5"
          aria-label="Meldinger"
        >
          <span className="relative flex h-11 w-11 items-center justify-center">
            <MessageCircle
              className={`size-6 ${isActive("/meldinger") ? "text-primary" : "text-muted-foreground"}`}
            />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </span>
          <span
            className={`text-[11px] ${isActive("/meldinger") ? "font-medium text-primary" : "text-muted-foreground"}`}
          >
            Meldinger
          </span>
        </Link>

        {/* Bruker */}
        <div className="flex flex-1 flex-col items-center gap-0.5">
          {user ? (
            <UserSheet
              userId={user.id}
              email={user.email ?? null}
              open={userOpen}
              setOpen={setUserOpen}
            />
          ) : (
            <Link
              to="/auth"
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground"
              aria-label="Logg inn"
            >
              <LogIn className="size-6" />
            </Link>
          )}
          <span className="text-[11px] text-muted-foreground">
            {user ? "Meg" : "Logg inn"}
          </span>
        </div>
      </div>
    </nav>
  );
}

function UserSheet({
  userId,
  email,
  open,
  setOpen,
}: {
  userId: string;
  email: string | null;
  open: boolean;
  setOpen: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: isAdmin } = useIsAdmin();

  const { data: profile } = useQuery({
    queryKey: ["profile-menu", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const displayName = profile?.display_name ?? email?.split("@")[0] ?? "Bruker";

  const go = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Brukermeny"
          className="flex h-10 w-10 items-center justify-center"
        >
          <Avatar className="size-8">
            {profile?.avatar_url && (
              <AvatarImage src={profile.avatar_url} alt={displayName} />
            )}
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {initials(profile?.display_name, email ?? "")}
            </AvatarFallback>
          </Avatar>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-3">
            <Avatar className="size-10">
              {profile?.avatar_url && (
                <AvatarImage src={profile.avatar_url} alt={displayName} />
              )}
              <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                {initials(profile?.display_name, email ?? "")}
              </AvatarFallback>
            </Avatar>
            <span className="flex flex-col">
              <span className="text-base">{displayName}</span>
              {email && (
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {email}
                </span>
              )}
            </span>
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 grid gap-1">
          <SheetItem onClick={() => go(() => navigate({ to: "/mine-annonser" }))}>
            Mine annonser
          </SheetItem>
          <SheetItem onClick={() => go(() => navigate({ to: "/favoritter" }))}>
            Favoritter
          </SheetItem>
          <SheetItem onClick={() => go(() => navigate({ to: "/mine-sok" }))}>
            Mine søk
          </SheetItem>
          <SheetItem onClick={() => go(() => navigate({ to: "/profil" }))}>
            Min profil
          </SheetItem>
          <SheetItem
            onClick={() => go(() => navigate({ to: "/profil", search: { tab: "konto" } }))}
          >
            Kontoinnstillinger
          </SheetItem>
          {isAdmin && (
            <SheetItem onClick={() => go(() => navigate({ to: "/admin" }))}>
              Administrasjon
            </SheetItem>
          )}
          <div className="my-2 h-px bg-border" />
          <SheetItem
            destructive
            onClick={async () => {
              setOpen(false);
              await supabase.auth.signOut();
              qc.clear();
              navigate({ to: "/" });
            }}
          >
            Logg ut
          </SheetItem>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SheetItem({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md px-3 py-3 text-left text-sm hover:bg-muted ${
        destructive ? "text-destructive" : ""
      }`}
    >
      {children}
    </button>
  );
}
