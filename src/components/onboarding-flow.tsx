import { useEffect, useRef, useState } from "react";
import { Bell, MapPin, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscribeNative } from "@/lib/native-push";
import { requestLocationPermission } from "@/lib/native";
import { hapticImpact } from "@/lib/haptics";

type Props = {
  onComplete: () => void;
};

type Card = "welcome" | "notifications" | "location" | "done";
const CARDS: Card[] = ["welcome", "notifications", "location"];

export function OnboardingFlow({ onComplete }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);

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
    scrollRef.current?.scrollTo({
      left: index * scrollRef.current.clientWidth,
      behavior: "smooth",
    });
  };

  const next = () => {
    if (currentIndex < CARDS.length - 1) {
      scrollTo(currentIndex + 1);
    } else {
      finish();
    }
  };

  const finish = () => {
    setFinishing(true);
    setTimeout(onComplete, 2200);
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
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
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
            <div className="mb-8 flex items-center gap-2">
              <span className="font-display text-4xl font-bold tracking-tight text-primary">
                Kaupet.no
              </span>
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Velkommen til Kaupet.no
            </h1>
            <p className="mt-4 max-w-xs text-base text-muted-foreground">
              Norges åpne markedsplass for brukte ting mellom privatpersoner. Ingen mellomledd,
              ingen reklame.
            </p>
            <button
              type="button"
              onClick={next}
              className="mt-12 flex flex-col items-center gap-2 text-sm text-muted-foreground"
            >
              <span>Sveip for å komme i gang</span>
              <ChevronRight className="size-5 rotate-180 animate-[swipe-hint_1.2s_ease-in-out_infinite]" />
            </button>
          </div>

          {/* Card 2: Notifications */}
          <div className="flex h-full w-full flex-none snap-center flex-col items-center justify-center px-8 text-center">
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bell className="size-10" />
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Ønsker du å motta varslinger?
            </h2>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Vi kan varsle deg om ny melding fra en kjøper eller selger, nye treff på lagrede søk,
              og prisendringer på annonser du følger.
            </p>
            <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
              <Button onClick={handleNotifications} className="w-full">
                Slå på varslinger
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
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background px-8 text-center duration-500 animate-in fade-in">
          <span className="font-display text-3xl font-bold tracking-tight text-primary">
            Kaupet.no
          </span>
          <p className="mt-6 text-lg text-muted-foreground">
            Takk for at du vil være en del av Kaupet.no.
            <br />
            Vi håper du trives!
          </p>
        </div>
      )}
    </div>
  );
}
