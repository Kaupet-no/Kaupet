import { useEffect, useRef, lazy, Suspense } from "react";
import { X } from "lucide-react";

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") history.back();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    // Clicking the semi-transparent backdrop closes the overlay
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kart for annonse"
      onClick={() => history.back()}
      className="fixed inset-0 z-[200] flex flex-col bg-black/60 px-[7.5%] py-[7.5%] backdrop-blur-sm"
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
          <Suspense fallback={<div className="h-full w-full animate-pulse rounded-2xl bg-muted" />}>
            <ListingDetailMap lat={lat} lng={lng} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
