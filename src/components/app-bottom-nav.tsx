import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, MessageCircle, Plus, X, LogIn, Home } from "lucide-react";
import { AdPickerOptions } from "@/components/ad-picker-options";
import { useState } from "react";

import { useAuth } from "@/lib/use-auth";
import { hapticImpact } from "@/lib/haptics";
import { isNative } from "@/lib/native";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { NotificationsBell } from "@/components/notifications-bell";
import { MessagesButton } from "@/components/messages-button";

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
  const [adPickerOpen, setAdPickerOpen] = useState(false);
  const native = isNative();

  const isOnNewAdPage =
    native && (pathname.startsWith("/ny-annonse") || pathname.startsWith("/ny-ok-annonse"));

  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

  const isOnVarsler = isActive("/varsler");
  const isOnMeldinger = isActive("/meldinger");
  const isOnMeg = isActive("/meg");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 px-3 pointer-events-none"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
    >
      <div className="pointer-events-auto mx-auto flex max-w-md items-end justify-around gap-1 rounded-3xl border border-border bg-background/95 px-3 pb-3 pt-3 shadow-xl backdrop-blur">
        {/* Hjem */}
        <Link to="/" className="flex flex-1 flex-col items-center gap-0.5" aria-label="Hjem">
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
        <div
          className={`flex flex-1 flex-col items-center gap-0.5 transition-opacity ${isOnVarsler ? "pointer-events-none opacity-30" : ""}`}
        >
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
          {user ? (
            <button
              type="button"
              aria-label={isOnNewAdPage ? "Avbryt" : "Ny annonse"}
              onClick={() => {
                void hapticImpact("light");
                if (isOnNewAdPage) {
                  void navigate({ to: "/" });
                } else {
                  setAdPickerOpen((o) => !o);
                }
              }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition active:scale-95"
            >
              {isOnNewAdPage || (native && adPickerOpen) ? (
                <X key="x" className="size-8 animate-[fab-icon-in_0.18s_ease-out]" />
              ) : (
                <Plus key="plus" className="size-8 animate-[fab-icon-in-reverse_0.18s_ease-out]" />
              )}
            </button>
          ) : (
            <Link
              to="/auth"
              search={{ mode: "signup" as const }}
              aria-label="Ny annonse"
              onClick={() => void hapticImpact("light")}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition active:scale-95"
            >
              <Plus className="size-8" />
            </Link>
          )}
          <span className="text-[11px] text-muted-foreground">
            {isOnNewAdPage ? "Avbryt" : "Ny annonse"}
          </span>
        </div>

        {/* Meldinger */}
        <div
          className={`flex flex-1 flex-col items-center gap-0.5 transition-opacity ${isOnMeldinger ? "pointer-events-none opacity-30" : ""}`}
        >
          {user ? (
            <div className="relative flex h-11 w-11 items-center justify-center">
              <MessagesButton />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate({ to: "/auth" })}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground"
              aria-label="Meldinger (logg inn)"
            >
              <MessageCircle className="size-6" />
            </button>
          )}
          <span className="text-[11px] text-muted-foreground">Meldinger</span>
        </div>

        {/* Bruker */}
        <div
          className={`flex flex-1 flex-col items-center gap-0.5 transition-opacity ${isOnMeg ? "pointer-events-none opacity-30" : ""}`}
        >
          {user ? (
            <UserAvatarButton userId={user.id} email={user.email ?? null} />
          ) : (
            <Link
              to="/auth"
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground"
              aria-label="Logg inn"
            >
              <LogIn className="size-6" />
            </Link>
          )}
          <span className="text-[11px] text-muted-foreground">{user ? "Meg" : "Logg inn"}</span>
        </div>
      </div>

      {/* Ny annonse-velger: web = Dialog, native = Sheet */}
      {!native && (
        <Dialog open={adPickerOpen} onOpenChange={setAdPickerOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Ny annonse</DialogTitle>
            </DialogHeader>
            <AdPickerOptions
              onSell={() => {
                setAdPickerOpen(false);
                void navigate({ to: "/ny-annonse", search: { type: "sell" } });
              }}
              onBuy={() => {
                setAdPickerOpen(false);
                void navigate({ to: "/ny-ok-annonse" });
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      {native && (
        <Sheet open={adPickerOpen} onOpenChange={setAdPickerOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl pb-8">
            <SheetHeader>
              <SheetTitle>Ny annonse</SheetTitle>
            </SheetHeader>
            <AdPickerOptions
              onSell={() => {
                setAdPickerOpen(false);
                void navigate({ to: "/ny-annonse", search: { type: "sell" } });
              }}
              onBuy={() => {
                setAdPickerOpen(false);
                void navigate({ to: "/ny-ok-annonse" });
              }}
            />
          </SheetContent>
        </Sheet>
      )}
    </nav>
  );
}

function UserAvatarButton({ userId, email }: { userId: string; email: string | null }) {
  const navigate = useNavigate();

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

  return (
    <button
      type="button"
      aria-label="Meg"
      onClick={() => void navigate({ to: "/meg" })}
      className="flex h-10 w-10 items-center justify-center"
    >
      <Avatar className="size-8">
        {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
        <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
          {initials(profile?.display_name, email ?? "")}
        </AvatarFallback>
      </Avatar>
    </button>
  );
}
