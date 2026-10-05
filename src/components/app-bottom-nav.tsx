import { initials } from "@/lib/format";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Search, MessageCircle, Plus, X, LogIn, Loader2 } from "lucide-react";
import { IntentTitleLanding } from "@/components/intent-title-landing";
import { useEffect, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { useUnreadNotificationsCount, useUnreadSystemMessagesCount } from "@/hooks/use-unread";
import { useAdminOpenEventsCount } from "@/hooks/use-admin-events";
import { CountBadge } from "@/components/ui/count-badge";
import { useFormFactor } from "@/hooks/use-form-factor";
import { hapticImpact } from "@/lib/haptics";
import { isNative } from "@/lib/native";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { MessagesButton } from "@/components/messages-button";
import logoIcon from "@/assets/brand/icon-only-green-letter.png";
import { focusWhenReady } from "@/lib/focus-when-ready";
import { readLastSearchContext, searchTabAction } from "@/lib/last-search-context";

export function AppBottomNav({ hidden }: { hidden?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [adPickerOpen, setAdPickerOpen] = useState(false);
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
  const isOnSearch = isActive("/annonser");
  const onSearchTab = () => {
    void hapticImpact("light");
    const action = searchTabAction(isOnSearch, window.scrollY);
    if (action === "scroll-top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (action === "focus") {
      // Fokus settes i selve trykket: WKWebView åpner bare tastaturet da.
      focusWhenReady(() => document.querySelector<HTMLInputElement>('main input[name="q"]'));
    } else {
      navigate({ to: "/annonser", search: readLastSearchContext()?.search ?? {} });
    }
  };
  const isOnMeldinger = isActive("/meldinger");
  const isOnMeg = isActive("/meg");

  // FAB-en er kun forstørret i bunnpillen på telefon; i railen er den like
  // stor som de andre knappene.
  const fabSize = rail ? "h-12 w-12" : "h-16 w-16 shadow-lg ring-4 ring-background";
  const fabIcon = rail ? "size-6" : "size-8";

  const itemClass = rail
    ? "flex flex-col items-center gap-0.5"
    : "flex flex-1 flex-col items-center gap-0.5";

  return (
    <nav
      aria-label={rail ? "Hovednavigasjon" : "Bunnavigasjon"}
      className={cn(
        "app-bottom-nav",
        rail
          ? "pointer-events-none fixed inset-y-0 left-0 z-50"
          : "fixed inset-x-0 bottom-0 z-50 px-3 pointer-events-none",
        // Skjules i stedet for å avmontere når tastaturet er synlig: sheeten
        // (ResponsiveOverlay) er rendret inni denne <nav>-en, og avmontering
        // rev den ned igjen sammen med adPickerOpen-tilstanden.
        hidden && "hidden",
      )}
      style={
        rail
          ? undefined
          : {
              paddingBottom: "calc(var(--safe-bottom) + 0.5rem)",
            }
      }
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
          <span className="flex h-12 w-12 items-center justify-center">
            <img
              src={logoIcon}
              alt=""
              className={`size-6 dark:brightness-125 ${isOnHome ? "" : "opacity-60"}`}
            />
          </span>
          <span
            className={`native-nav-label ${isOnHome ? "font-medium text-primary" : "text-muted-foreground"}`}
          >
            Hjem
          </span>
        </Link>

        {/* Søk er et sted, ikke en skuff: fanen går til /annonser med siste
            søk i behold. Et nytt søk startes med X i feltet eller «Nullstill». */}
        <div className={itemClass}>
          <button
            type="button"
            onClick={onSearchTab}
            className={`flex h-12 w-12 items-center justify-center rounded-full ${
              isOnSearch ? "text-primary" : "text-muted-foreground"
            }`}
            aria-label="Søk"
            aria-current={isOnSearch ? "page" : undefined}
          >
            <Search className="size-6" />
          </button>
          <span
            className={`native-nav-label ${isOnSearch ? "font-medium text-primary" : "text-muted-foreground"}`}
          >
            Søk
          </span>
        </div>

        {/* Ny annonse (FAB) — midten */}
        {/* -mt-7 løfter FAB-en ut av bunnpillen. I railen står den i flyten
            som de andre — det er ingen kant å stikke opp av. */}
        <div className={rail ? itemClass : `-mt-7 ${itemClass}`}>
          {authLoading ? (
            <AuthPendingButton
              label="Ny annonse"
              className={cn("bg-primary text-primary-foreground", fabSize)}
              iconClassName={fabIcon}
            />
          ) : (
            // Åpner intensjon+tittel-velgeren for både innloggede og
            // utloggede brukere — utkastet lagres lokalt, innlogging skjer
            // først ved publisering (samme mønster som ny-annonse.tsx/
            // ny-ok-annonse.tsx sin gjestedraft).
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
              className={cn(
                "flex items-center justify-center rounded-full bg-primary text-primary-foreground transition active:scale-95",
                fabSize,
              )}
            >
              {isOnNewAdPage || (native && adPickerOpen) ? (
                <X key="x" className={cn(fabIcon, "animate-[fab-icon-in_0.18s_ease-out]")} />
              ) : (
                <Plus
                  key="plus"
                  className={cn(fabIcon, "animate-[fab-icon-in-reverse_0.18s_ease-out]")}
                />
              )}
            </button>
          )}
          <span className="native-nav-label text-muted-foreground">
            {isOnNewAdPage ? "Avbryt" : "Ny annonse"}
          </span>
        </div>

        {/* Meldinger */}
        <div className={itemClass}>
          {authLoading ? (
            <AuthPendingButton label="Meldinger" className="h-12 w-12 text-muted-foreground" />
          ) : user ? (
            <div className="relative flex h-12 w-12 items-center justify-center">
              <MessagesButton isActive={isOnMeldinger} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                void hapticImpact("light");
                navigate({ to: "/auth" });
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground"
              aria-label="Meldinger (logg inn)"
              aria-current={isOnMeldinger ? "page" : undefined}
            >
              <MessageCircle className="size-6" />
            </button>
          )}
          <span
            className={`native-nav-label ${isOnMeldinger ? "font-medium text-primary" : "text-muted-foreground"}`}
          >
            Meldinger
          </span>
        </div>

        {/* Bruker */}
        <div className={itemClass}>
          {/* Se kommentaren i site-header.tsx: sesjonen er ikke kjent før
              hydreringen har lest localStorage, og fram til da sa denne
              fanen «Logg inn» til en innlogget bruker. */}
          {authLoading ? (
            <AuthPendingButton label="Konto" className="h-12 w-12 text-muted-foreground" />
          ) : user ? (
            // Etiketten ligger inni knappen: tidligere traff bare den 48 px
            // store avataren, og trykk på «Meg»-teksten gikk tapt.
            <UserAvatarButton
              userId={user.id}
              email={user.email ?? null}
              isActive={isOnMeg}
              className="flex w-full flex-col items-center gap-0.5"
            />
          ) : (
            <Link
              to="/auth"
              onClick={() => void hapticImpact("light")}
              className="flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground"
              aria-label="Logg inn"
              aria-current={isOnMeg ? "page" : undefined}
            >
              <LogIn className="size-6" />
            </Link>
          )}
          {(authLoading || !user) && (
            <span className="native-nav-label text-muted-foreground">
              {/* Hardt mellomrom, ikke tom streng: etiketten skal reservere
                  linjehøyden sin, ellers blir kolonnen lavere enn naboene og
                  FAB-en flytter seg i de ~100 ms tilstanden varer. */}
              {authLoading ? "\u00A0" : "Logg inn"}
            </span>
          )}
        </div>
      </div>

      {/* Ny annonse-velger: telefon = Sheet, nettbrett/web = Dialog. */}
      <ResponsiveOverlay open={adPickerOpen} onOpenChange={setAdPickerOpen}>
        <ResponsiveOverlayContent className="sm:max-w-4xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Hva vil du gjøre?</DialogTitle>
          </DialogHeader>
          <IntentTitleLanding onNavigate={() => setAdPickerOpen(false)} />
        </ResponsiveOverlayContent>
      </ResponsiveOverlay>
    </nav>
  );
}

/** Plassholder for en bunnnav-knapp som ikke kan svare ennå.
 *
 * Sesjonen ligger i localStorage og er ukjent til hydreringen har lest den
 * (~100 ms). Tidligere rendret disse knappene sin utloggede variant i det
 * vinduet: «Logg inn»-fanen blinket for en innlogget bruker, og et trykk på
 * «Ny annonse» eller «Meldinger» sendte henne til innloggingssiden i stedet
 * for dit hun skulle. Her er knappen `disabled` — den fanger trykket uten å
 * navigere feil — og spinneren sier at noe lastes, framfor å etterlate et
 * tomt hull i menylinjen. Formen er identisk med den ferdige knappen, så
 * ingenting hopper når svaret kommer. */
export function AuthPendingButton({
  label,
  className,
  iconClassName = "size-6",
}: {
  label: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <button
      type="button"
      disabled
      aria-label={`${label} (laster)`}
      aria-busy="true"
      className={cn("flex items-center justify-center rounded-full", className)}
    >
      <Loader2 className={cn("animate-spin motion-reduce:animate-none", iconClassName)} />
    </button>
  );
}

export function UserAvatarButton({
  userId,
  email,
  isActive,
  className,
}: {
  userId: string;
  email: string | null;
  isActive?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  // Meg-fanen er den eneste inngangen til varsler i den native
  // informasjonsarkitekturen, så systemmeldinger («Kaupet-teamet») telles inn
  // her i stedet for å få en egen badge ved siden av — se
  // useUnreadSystemMessagesCount i use-unread.ts.
  const unreadCount = useUnreadNotificationsCount() + useUnreadSystemMessagesCount();
  // Meg-fanen er profilikonet i native — admin-hendelser vises her som i
  // webens brukermeny, men med eget tall i aria-label.
  const adminEvents = useAdminOpenEventsCount();
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
      aria-label={[
        "Meg",
        unreadCount > 0 && `${unreadCount} nye varsler`,
        adminEvents > 0 && `${adminEvents} nye administrasjonshendelser`,
      ]
        .filter(Boolean)
        .join(", ")}
      aria-current={isActive ? "page" : undefined}
      onClick={() => {
        void hapticImpact("light");
        void navigate({ to: "/meg" });
      }}
      className={className}
    >
      <span className="relative flex h-12 w-12 items-center justify-center">
        <Avatar className="size-8">
          {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
          <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
            {initials(profile?.display_name, email ?? "")}
          </AvatarFallback>
        </Avatar>
        {unreadCount + adminEvents > 0 && (
          <CountBadge count={unreadCount + adminEvents} className="absolute right-0 top-0" />
        )}
      </span>
      <span
        className={`native-nav-label ${isActive ? "font-medium text-primary" : "text-muted-foreground"}`}
        aria-hidden="true"
      >
        Meg
      </span>
    </button>
  );
}
