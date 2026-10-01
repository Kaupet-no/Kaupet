import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check, ChevronRight, Loader2, LogIn } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatErrorMessage } from "@/lib/errors";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { hapticImpact } from "@/lib/haptics";
import { setBackOverride } from "@/lib/native-offline";
import { FullscreenOverlay, FullscreenOverlayContent } from "@/components/ui/fullscreen-overlay";
import { useAuth } from "@/hooks/use-auth";
import { usePushStatus } from "@/hooks/use-push-status";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type Props = {
  onComplete: () => void;
};

type Card = "welcome" | "signin" | "notifications";

const welcomePoints = [
  "Gratis å legge ut annonser",
  "Ingen sporing av brukeraktivitet",
  "100% åpen kildekode",
];

function CardNav({
  isLast,
  onNext,
  onFinish,
  reduceMotion,
}: {
  isLast: boolean;
  onNext: () => void;
  onFinish: () => void;
  reduceMotion: boolean;
}) {
  return (
    <button
      type="button"
      onClick={isLast ? onFinish : onNext}
      className="mt-12 flex flex-col items-center gap-2 text-sm text-muted-foreground"
    >
      <span>{isLast ? "Kom i gang" : "Neste"}</span>
      <ChevronRight
        className={`size-5 ${reduceMotion ? "" : "animate-[swipe-hint_1.2s_ease-in-out_infinite]"}`}
      />
    </button>
  );
}

// Innlogging direkte i onboardingen. Etter innlogging bytter useAuth til
// innlogget bruker, og kortet viser «Kom i gang» (eller push-tilbudet dukker
// opp som neste kort). Registrering og glemt passord går fortsatt til /auth.
function SignInForm({ onSkip }: { onSkip: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const turnstileEnabled = !!import.meta.env.VITE_TURNSTILE_SITE_KEY;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const turnstileToken = turnstileEnabled
        ? await turnstileRef.current?.getResponsePromise()
        : undefined;
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: { captchaToken: turnstileToken ?? undefined },
      });
      if (error) throw error;
      showSuccessToast("Velkommen tilbake!");
    } catch (err: unknown) {
      showErrorToast(formatErrorMessage(err, "Noe gikk galt. Prøv igjen."));
      turnstileRef.current?.reset();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 flex w-full max-w-xs flex-col gap-3 text-left">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="onboarding-email">E-post</Label>
          <Input
            id="onboarding-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="kari@eksempel.no"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="onboarding-password">Passord</Label>
          <Input
            id="onboarding-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {turnstileEnabled && (
          <Turnstile
            ref={turnstileRef}
            siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
            options={{ appearance: "interaction-only", action: "kaupet" }}
          />
        )}
        <Button
          type="submit"
          className="w-full gap-2"
          disabled={loading || !email.trim() || !password}
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          Logg inn
        </Button>
      </form>
      <div className="flex justify-between text-xs">
        <Link
          to="/auth"
          search={{ mode: "reset", returnTo: "/" }}
          className="font-medium text-primary hover:underline"
        >
          Glemt passord?
        </Link>
        <Link
          to="/auth"
          search={{ mode: "signup", returnTo: "/" }}
          className="font-medium text-primary hover:underline"
        >
          Bli medlem
        </Link>
      </div>
      <Button variant="ghost" onClick={onSkip} className="w-full text-muted-foreground">
        Hopp over
      </Button>
    </div>
  );
}

export function OnboardingFlow({ onComplete }: Props) {
  const { user, loading: authLoading } = useAuth();
  const push = usePushStatus();
  const pushOfferEligible =
    !!user && !push.loading && push.supported && push.permission === "default";
  const [pushOfferVisited, setPushOfferVisited] = useState(false);
  const showPushOffer = !!user && (pushOfferEligible || pushOfferVisited);
  // Innloggingskortet er siste kort for utloggede. Det blir stående etter
  // innlogging her, så kortet brukeren står på ikke forsvinner under dem.
  const [signedOutDuringOnboarding, setSignedOutDuringOnboarding] = useState(false);
  if (!authLoading && !user && !signedOutDuringOnboarding) setSignedOutDuringOnboarding(true);
  const showSignIn = !user || signedOutDuringOnboarding;
  const cards: Card[] = ["welcome"];
  if (showSignIn) cards.push("signin");
  if (showPushOffer) cards.push("notifications");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Kortlisten kan krympe (auth lastet inn som innlogget) — klem indeksen.
  const activeCard = cards[Math.min(currentIndex, cards.length - 1)];
  const [finishing, setFinishing] = useState(false);
  const finishTimer = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(
    () => () => {
      if (finishTimer.current != null) window.clearTimeout(finishTimer.current);
    },
    [],
  );

  // Fingersveip oppdaterer gjeldende kort via onScroll på containeren. En
  // addEventListener i en mount-effekt festet seg aldri: Radix-portalen i
  // FullscreenOverlayContent monterer innholdet først etter første commit, så
  // scrollRef var null. Da ble activeCard stående på «welcome», og de
  // sveipede kortene forble inert — knappene der reagerte ikke.
  const lastScrollIndex = useRef(0);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== lastScrollIndex.current) {
      lastScrollIndex.current = index;
      setCurrentIndex(index);
      void hapticImpact("light");
    }
  };

  const scrollTo = (index: number) => {
    // Ikke stol på scroll-eventet alene for å oppdatere prikkene: en
    // programmatisk smooth-scroll avfyrer ikke pålitelig et avsluttende
    // "scroll"-event i alle WebViews, så indikatoren kunne bli stående på
    // steg 1 selv om kortet skiftet. Sett indeksen direkte her siden vi selv
    // vet hvor vi scroller — lytteren under dekker fortsatt ekte fingersveip.
    setCurrentIndex(index);
    scrollRef.current?.scrollTo({
      left: index * scrollRef.current.clientWidth,
      behavior: "smooth",
    });
  };

  // Android-tilbake skal navigere mellom onboarding-kortene i stedet for å
  // avslutte appen (default i native-offline.ts). Kun på første kort faller
  // trykket gjennom til default exitApp — samme som å trykke tilbake på
  // rot-siden.
  useEffect(() => {
    setBackOverride(() => {
      if (currentIndex > 0) {
        scrollTo(currentIndex - 1);
        return true;
      }
      return false;
    });
    return () => setBackOverride(null);
  }, [currentIndex]);

  const next = () => {
    if (currentIndex < cards.length - 1) {
      if (cards[currentIndex + 1] === "notifications" && pushOfferEligible) {
        setPushOfferVisited(true);
      }
      scrollTo(currentIndex + 1);
    } else {
      finish();
    }
  };

  const finish = () => {
    if (finishing) return;
    setFinishing(true);
    finishTimer.current = window.setTimeout(onComplete, reduceMotion ? 500 : 1200);
  };

  const completeNow = () => {
    if (finishTimer.current != null) window.clearTimeout(finishTimer.current);
    finishTimer.current = null;
    onComplete();
  };

  const handleNotifications = async () => {
    setPushOfferVisited(true);
    if (push.permission !== "default") {
      next();
      return;
    }
    try {
      // Uten type: meldinger, lagrede søk og prisfall følger brukerens
      // eksisterende valg (på som standard) — det kortet lover.
      await push.enableOnThisDevice();
    } catch {
      // User denied or error — continue anyway
    }
    next();
  };

  return (
    // historyBack={false}: onboardingen blokkerer bevisst Escape og klikk
    // utenfor, og skal heller ikke kunne lukkes med Android-tilbake.
    <FullscreenOverlay open onOpenChange={() => {}} historyBack={false}>
      <FullscreenOverlayContent
        title="Velkommen til Kaupet.no"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Cards container */}
        <div
          className={`min-h-0 flex-1 transition-opacity duration-700 ${finishing ? "opacity-0" : "opacity-100"}`}
        >
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="flex h-full snap-x snap-mandatory overflow-x-scroll scrollbar-none"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {/* Card 1: Welcome */}
            <div
              className="flex h-full w-full flex-none snap-center flex-col items-center justify-center overflow-y-auto px-8 py-8 text-center"
              aria-hidden={activeCard !== "welcome"}
              inert={activeCard !== "welcome"}
            >
              {/* Hilsen og ordmerke er én overskrift, så skjermlesere leser dem samlet. */}
              <h1
                aria-label="Velkommen til kaupet.no"
                className="flex flex-col items-center font-display tracking-tight"
              >
                <span className="mb-1 text-lg font-normal text-muted-foreground">
                  Velkommen til
                </span>
                <span className="flex items-baseline gap-1 font-bold">
                  <span className="text-5xl text-primary">kaupet</span>
                  <span className="text-5xl text-brand">.</span>
                  <span className="text-4xl text-muted-foreground">no</span>
                </span>
              </h1>
              {/* Slagordet i samme stil som hero-overskriften på web (routes/index.tsx). */}
              <p className="mt-6 max-w-xs font-display text-xl tracking-tight">
                Gi tingene dine <span className="italic text-brand">et nytt liv</span>.
              </p>
              <ul className="mt-10 flex flex-col gap-3 text-left">
                {welcomePoints.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm">
                    <Check className="text-brand-text mt-0.5 size-4 shrink-0" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <Button onClick={next} className="mt-12 w-full max-w-xs">
                Kom i gang
              </Button>
            </div>

            {/* Card 2: Sign in (utloggede) */}
            {showSignIn && (
              <div
                className="flex h-full w-full flex-none snap-center flex-col items-center justify-center overflow-y-auto px-8 py-8 text-center"
                aria-hidden={activeCard !== "signin"}
                inert={activeCard !== "signin"}
              >
                <div className="mb-6 flex size-20 flex-none items-center justify-center rounded-full bg-primary/10 text-primary">
                  <LogIn className="size-10" />
                </div>
                <h2 className="font-display text-2xl font-semibold tracking-tight">
                  {user ? "Du er logget inn" : "Har du allerede en konto?"}
                </h2>
                <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                  {user
                    ? "Lagrede søk og meldinger er klare."
                    : "Logg inn for å hente lagrede søk og meldinger."}
                </p>
                {user ? (
                  <CardNav
                    isLast={cards.indexOf("signin") === cards.length - 1}
                    onNext={next}
                    onFinish={finish}
                    reduceMotion={reduceMotion}
                  />
                ) : authLoading ? (
                  <Button
                    variant="ghost"
                    disabled
                    className="mt-10 w-full max-w-xs text-muted-foreground"
                  >
                    Hopp over
                  </Button>
                ) : (
                  <SignInForm onSkip={finish} />
                )}
              </div>
            )}

            {/* Card 2: Notifications */}
            {showPushOffer && (
              <div
                className="flex h-full w-full flex-none snap-center flex-col items-center justify-center overflow-y-auto px-8 py-8 text-center"
                aria-hidden={activeCard !== "notifications"}
                inert={activeCard !== "notifications"}
              >
                <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bell className="size-10" />
                </div>
                <h2 className="font-display text-2xl font-semibold tracking-tight">
                  Vil du ha varsler?
                </h2>
                <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                  Vi kan si fra når et lagret søk får nye treff, når noen sender deg en melding
                  eller når en favoritt blir satt ned i pris. Du velger selv hva du vil ha under
                  Profil.
                </p>
                <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
                  <Button onClick={handleNotifications} className="w-full">
                    Slå på varsler
                  </Button>
                  <Button variant="ghost" onClick={next} className="w-full text-muted-foreground">
                    Ikke nå
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dot indicators */}
        <div
          className={`flex justify-center gap-2 pb-8 pt-4 transition-opacity duration-700 ${finishing ? "opacity-0" : "opacity-100"} ${cards.length === 1 ? "invisible" : ""}`}
        >
          {cards.map((card, i) => (
            <button
              key={card}
              type="button"
              onClick={() => {
                if (card === "notifications") setPushOfferVisited(true);
                scrollTo(i);
              }}
              aria-label={`Gå til kort ${i + 1}`}
              className={`h-2 rounded-full transition-[width,background-color] duration-300 ${
                i === currentIndex ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        {/* Finishing overlay */}
        {finishing && (
          <button
            type="button"
            onClick={completeNow}
            className={`absolute inset-0 flex w-full flex-col items-center justify-center bg-background px-8 text-center ${reduceMotion ? "" : "duration-500 animate-in fade-in"}`}
            aria-label="Fortsett til Kaupet"
          >
            <span className="flex items-baseline gap-1">
              <span className="font-display text-3xl font-bold tracking-tight text-primary">
                kaupet
              </span>
              <span className="font-display text-3xl font-bold tracking-tight text-brand">.</span>
              <span className="font-display text-2xl font-bold tracking-tight text-muted-foreground">
                no
              </span>
            </span>
            <p className="mt-6 text-lg text-muted-foreground">
              Takk for at du vil være en del av Kaupet.no.
              <br />
              Vi håper du vil trives!
            </p>
          </button>
        )}
      </FullscreenOverlayContent>
    </FullscreenOverlay>
  );
}
