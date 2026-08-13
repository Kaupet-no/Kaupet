import { useEffect, useRef, useState } from "react";
import { Bell, MapPin, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscribeNative } from "@/lib/native-push";
import { requestLocationPermission } from "@/lib/native";
import { hapticImpact } from "@/lib/haptics";
import { setBackOverride } from "@/lib/native-offline";
import { FullscreenOverlay, FullscreenOverlayContent } from "@/components/ui/fullscreen-overlay";
import { useAuth } from "@/hooks/use-auth";
import { trackProductEvent } from "@/lib/product-analytics";

type Props = {
  onComplete: () => void;
};

type Card = "welcome" | "notifications" | "location" | "done";
const CARDS: Card[] = ["welcome", "notifications", "location"];

export function OnboardingFlow({ onComplete }: Props) {
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const finishTimer = useRef<number | null>(null);
  const [reduceMotion] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  useEffect(
    () => () => {
      if (finishTimer.current != null) window.clearTimeout(finishTimer.current);
    },
    [],
  );

  // Track scroll position to update dot indicators
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let lastIndex = 0;
    const onScroll = () => {
      const index = Math.round(el.scrollLeft / el.clientWidth);
      if (index !== lastIndex) {
        lastIndex = index;
        setCurrentIndex(index);
        void hapticImpact("light");
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

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
    if (currentIndex < CARDS.length - 1) {
      scrollTo(currentIndex + 1);
    } else {
      finish();
    }
  };

  const finish = () => {
    if (finishing) return;
    setFinishing(true);
    trackProductEvent("onboarding_completed", { signedIn: !!user });
    finishTimer.current = window.setTimeout(onComplete, reduceMotion ? 500 : 2200);
  };

  const completeNow = () => {
    if (finishTimer.current != null) window.clearTimeout(finishTimer.current);
    finishTimer.current = null;
    onComplete();
  };

  const handleNotifications = async () => {
    try {
      await subscribeNative();
    } catch {
      // User denied or error — continue anyway
    }
    next();
  };

  const handleLocation = async () => {
    try {
      await requestLocationPermission();
    } catch {
      // User denied or error — continue anyway
    }
    finish();
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
          className={`flex-1 transition-opacity duration-700 ${finishing ? "opacity-0" : "opacity-100"}`}
        >
          <div
            ref={scrollRef}
            className="flex h-full snap-x snap-mandatory overflow-x-scroll scrollbar-none"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {/* Card 1: Welcome */}
            <div className="flex h-full w-full flex-none snap-center flex-col items-center justify-center px-8 text-center">
              <div className="mb-8 flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold tracking-tight text-primary">
                  kaupet
                </span>
                <span className="font-display text-4xl font-bold tracking-tight text-accent">
                  .
                </span>
                <span className="font-display text-3xl font-bold tracking-tight text-muted-foreground">
                  no
                </span>
              </div>
              <h1 className="font-display text-3xl font-semibold tracking-tight">Velkommen!</h1>
              <p className="mt-4 max-w-xs text-base text-muted-foreground">
                Kaupet er bygget for å være en litt annerledes markedsplass. Minst mulig
                datainnsamling om deg, ingen reklame og 100% fri kildekode.
              </p>
              <button
                type="button"
                onClick={next}
                className="mt-12 flex flex-col items-center gap-2 text-sm text-muted-foreground"
              >
                <span>Sveip for å komme i gang</span>
                <ChevronRight className="size-5 animate-[swipe-hint_1.2s_ease-in-out_infinite]" />
              </button>
            </div>

            {/* Card 2: Notifications */}
            <div className="flex h-full w-full flex-none snap-center flex-col items-center justify-center px-8 text-center">
              <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bell className="size-10" />
              </div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                Ønsker du å motta varsler?
              </h2>
              <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                {user
                  ? "Få beskjed om nye meldinger, nye treff på lagrede søk og prisendringer på favorittene dine."
                  : "Vi kan varsle om nye meldinger, nye treff på lagrede søk og prisendringer på favoritter. Du kan justere hva du ønsker å varsles om på profilsiden din."}
              </p>
              <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
                <Button onClick={handleNotifications} className="w-full">
                  Slå på varsler
                </Button>
                <Button variant="ghost" onClick={next} className="w-full text-muted-foreground">
                  Hopp over
                </Button>
              </div>
            </div>

            {/* Card 3: Location */}
            <div className="flex h-full w-full flex-none snap-center flex-col items-center justify-center px-8 text-center">
              <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MapPin className="size-10" />
              </div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                Ønsker du å dele lokasjonsdata?
              </h2>
              <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                Vi trenger dette for å kunne vise annonser i nærheten av deg, slik at du enkelt kan
                finne det du leter etter lokalt.
              </p>
              <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
                <Button onClick={handleLocation} className="w-full">
                  Del lokasjonsdata
                </Button>
                <Button variant="ghost" onClick={finish} className="w-full text-muted-foreground">
                  Hopp over
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Dot indicators */}
        <div
          className={`flex justify-center gap-2 pb-8 pt-4 transition-opacity duration-700 ${finishing ? "opacity-0" : "opacity-100"}`}
        >
          {CARDS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollTo(i)}
              aria-label={`Gå til kort ${i + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${
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
              <span className="font-display text-3xl font-bold tracking-tight text-accent">.</span>
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
