import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Search, MessageCircle, Plus, X, LogIn } from "lucide-react";
import { AdPickerOptions } from "@/components/ad-picker-options";
import { useEffect, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { useFormFactor } from "@/hooks/use-form-factor";
import { hapticImpact } from "@/lib/haptics";
import { isNative } from "@/lib/native";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { MessagesButton } from "@/components/messages-button";
import logoIcon from "@/assets/brand/icon-only-green-letter.png";
import { useSearchPanel } from "@/features/listing-search/search-panel/search-panel-context";
import { trackProductEvent } from "@/lib/product-analytics";

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
  const { open: searchOpen, openPanel } = useSearchPanel();
  const native = isNative();
  // Nettbrett: sidestilt navigasjon i stedet for den flytende bunnpillen
  // (fase 10). Samme rutedefinisjoner og samme tilstand — kun presentasjonen
  // skiller, jf. planens «ikke en parallell navigasjonskomponent».
  const rail = useFormFactor() === "tablet";

  // Innholdet må reservere plass til venstre i stedet for under, se
  // `.nav-rail` i styles.css.
  useEffect(() => {
    if (!rail) return;
    document.documentElement.classList.add("nav-rail");
    return () => document.documentElement.classList.remove("nav-rail");
  }, [rail]);

  const isOnNewAdPage =
    native && (pathname.startsWith("/ny-annonse") || pathname.startsWith("/ny-ok-annonse"));

  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

  const isOnHome = pathname === "/";
  const isOnSearch = searchOpen || isActive("/annonser");
  const isOnMeldinger = isActive("/meldinger");
  const isOnMeg = isActive("/meg");

  const itemClass = rail
    ? "flex flex-col items-center gap-0.5"
    : "flex flex-1 flex-col items-center gap-0.5";

  return (
    <nav
      aria-label={rail ? "Hovednavigasjon" : "Bunnavigasjon"}
      className={
        rail
          ? "pointer-events-none fixed inset-y-0 left-0 z-50"
          : "fixed inset-x-0 bottom-0 z-50 px-3 pointer-events-none"
      }
      style={rail ? undefined : { paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
    >
      <div
        className={
          rail
            ? "pl-safe pointer-events-auto flex h-full w-20 flex-col items-center justify-center gap-7 border-r border-border bg-background/95 backdrop-blur"
            : "pointer-events-auto mx-auto flex max-w-md items-end justify-around gap-1 rounded-3xl border border-border bg-background/95 px-3 pb-3 pt-3 shadow-xl backdrop-blur"
        }
      >
        {/* Hjem — fane 1. Filterpanelet har sin egen filter-knapp i
            søkefeltet på /annonser, så denne fanen trenger ikke lenger åpne
            søkepanelet direkte. */}
        <Link
          to="/"
          onClick={() => void hapticImpact("light")}
          className={itemClass}
          aria-label="Hjem"
          aria-current={isOnHome ? "page" : undefined}
        >
          <span className="flex h-11 w-11 items-center justify-center">
            <img
              src={logoIcon}
              alt=""
              className={`size-6 dark:brightness-125 ${isOnHome ? "" : "opacity-60"}`}
            />
          </span>
          <span
            className={`text-[11px] ${isOnHome ? "font-medium text-primary" : "text-muted-foreground"}`}
          >
            Hjem
          </span>
        </Link>

        {/* Søk er en primær handling og er tilgjengelig uten konto. */}
        <div className={itemClass} aria-current={isOnSearch ? "page" : undefined}>
          <button
            type="button"
            onClick={() => {
              void hapticImpact("light");
              trackProductEvent("search_opened", { source: "bottom_nav" });
              openPanel("categories");
            }}
            className={`flex h-11 w-11 items-center justify-center rounded-full ${
              isOnSearch ? "text-primary" : "text-muted-foreground"
            }`}
            aria-label="Søk"
          >
            <Search className="size-6" />
          </button>
          <span
            className={`text-[11px] ${isOnSearch ? "font-medium text-primary" : "text-muted-foreground"}`}
          >
            Søk
          </span>
        </div>

        {/* Ny annonse (FAB) — midten */}
        {/* -mt-7 løfter FAB-en ut av bunnpillen. I railen står den i flyten
            som de andre — det er ingen kant å stikke opp av. */}
        <div className={rail ? itemClass : `-mt-7 ${itemClass}`}>
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
        <div className={itemClass} aria-current={isOnMeldinger ? "page" : undefined}>
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
          <span
            className={`text-[11px] ${isOnMeldinger ? "font-medium text-primary" : "text-muted-foreground"}`}
          >
            Meldinger
          </span>
        </div>

        {/* Bruker */}
        <div className={itemClass} aria-current={isOnMeg ? "page" : undefined}>
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
          <span
            className={`text-[11px] ${isOnMeg ? "font-medium text-primary" : "text-muted-foreground"}`}
          >
            {user ? "Meg" : "Logg inn"}
          </span>
        </div>
      </div>

      {/* Ny annonse-velger: telefon = Sheet, nettbrett/web = Dialog. */}
      <ResponsiveOverlay open={adPickerOpen} onOpenChange={setAdPickerOpen}>
        <ResponsiveOverlayContent className="sm:max-w-md">
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
        </ResponsiveOverlayContent>
      </ResponsiveOverlay>
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
