import { useEffect, useRef, lazy, Suspense } from "react";
import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { FullscreenOverlay, FullscreenOverlayContent } from "@/components/ui/fullscreen-overlay";

const ListingDetailMap = lazy(() =>
  import("@/components/listing-detail-map").then((m) => ({ default: m.ListingDetailMap })),
);

type Props = {
  lat: number;
  lng: number;
  onClose: () => void;
};

export function MapOverlay({ lat, lng, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    history.pushState({ overlay: "map" }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [onClose]);

  return (
    <FullscreenOverlay open onOpenChange={(next) => !next && history.back()}>
      {/* Clicking the semi-transparent backdrop closes the overlay */}
      <FullscreenOverlayContent
        title="Kart for annonse"
        onClick={() => history.back()}
        // edgeToEdge: bakteppet skal dekke hele skjermen. Kortet innenfor er
        // allerede trukket 7,5 % inn fra hver kant, som er godt klar av
        // notch/home indicator i begge orienteringer — det er derfor ingen
        // egen safe-area-padding trengs på chromet her.
        edgeToEdge
        className="bg-black/60 px-[7.5%] py-[7.5%] backdrop-blur-sm"
      >
        {/* Card panel — stops propagation so clicks inside don't close the overlay */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background shadow-2xl"
        >
          <div className="flex items-start justify-between px-4 py-3">
            <p className="mt-1 text-xs text-muted-foreground">
              Lokasjonen er omtrentlig. Gjenstanden befinner seg ikke nødvendigvis innenfor det
              markerte området.
            </p>
            <button
              ref={closeRef}
              type="button"
              onClick={() => history.back()}
              aria-label="Lukk kart"
              className="rounded-full p-2 text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-6" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
            <Suspense fallback={<Skeleton className="h-full w-full rounded-2xl" />}>
              <ListingDetailMap lat={lat} lng={lng} />
            </Suspense>
          </div>
        </div>
      </FullscreenOverlayContent>
    </FullscreenOverlay>
  );
}
