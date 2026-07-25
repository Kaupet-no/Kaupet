import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, Smartphone, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { signVehicle360FrameUrls } from "@/lib/storage";
import {
  createVehicle360CaptureSession,
  deleteVehicle360Frames,
  getVehicle360Frames,
} from "@/lib/vehicle-360.functions";

async function generateQrDataUrl(url: string): Promise<string> {
  const mod = (await import("qrcode/lib/browser.js")) as {
    toDataURL?: (text: string, opts?: unknown) => Promise<string>;
    default?: { toDataURL?: (text: string, opts?: unknown) => Promise<string> };
  };
  const toDataURL = mod.toDataURL ?? mod.default?.toDataURL;
  if (typeof toDataURL !== "function") throw new Error("QR-bibliotek mangler toDataURL");
  return toDataURL(url, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 240,
    color: { dark: "#0b1f17", light: "#ffffff" },
  });
}

/**
 * Desktop-only panel on the bildeopplastning-steget for Bil/MC-annonser:
 * viser en QR-kode brukeren kan skanne med mobilen for å ta opptak av en
 * 360°-bildesekvens av kjøretøyet. Krever en persistert draft (tittel ≥ 5
 * tegn) siden mobilopptaket knyttes til en ekte listing_id via en
 * tidsbegrenset token-sesjon (se vehicle-360.functions.ts).
 */
export function Vehicle360QrPanel({
  draftId,
  ensureDraftId,
}: {
  draftId: string | null;
  ensureDraftId: () => Promise<string | null>;
}) {
  const createSession = useServerFn(createVehicle360CaptureSession);
  const fetchFrames = useServerFn(getVehicle360Frames);
  const deleteFrames = useServerFn(deleteVehicle360Frames);

  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const generationRef = useRef(0);

  const framesQuery = useQuery({
    queryKey: ["vehicle-360-frames", draftId],
    enabled: !!draftId,
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? false : 3000),
    queryFn: async () => {
      const frames = await fetchFrames({ data: { listingId: draftId! } });
      return frames;
    },
  });

  const frames = framesQuery.data ?? [];
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (frames.length === 0) return;
    signVehicle360FrameUrls(frames.map((f) => f.storage_path)).then(setImgUrls);
  }, [frames]);

  async function startSession() {
    setCreating(true);
    try {
      const id = draftId ?? (await ensureDraftId());
      if (!id) {
        showErrorToast("Skriv inn en tittel (minst 5 tegn) før du starter 360°-opptak.");
        return;
      }
      const myGeneration = ++generationRef.current;
      setGenerating(true);
      setQrSrc(null);
      const { token } = await createSession({ data: { listingId: id } });
      const url = `https://kaupet.no/360-opptak/${token}`;
      const dataUrl = await generateQrDataUrl(url);
      if (generationRef.current === myGeneration) setQrSrc(dataUrl);
    } catch (e) {
      console.error("[vehicle-360] kunne ikke starte opptaksøkt", e);
      showErrorToast("Kunne ikke generere QR-kode. Prøv igjen.");
    } finally {
      setGenerating(false);
      setCreating(false);
    }
  }

  async function clearFrames() {
    if (!draftId) return;
    try {
      await deleteFrames({ data: { listingId: draftId } });
      showSuccessToast("360°-bildene ble fjernet");
      framesQuery.refetch();
      setQrSrc(null);
    } catch {
      showErrorToast("Kunne ikke fjerne bildene");
    }
  }

  if (frames.length > 0) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            360°-visning klar — {frames.length} bilder mottatt fra mobil
          </p>
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={clearFrames}>
            <Trash2 className="size-3.5" /> Fjern og prøv igjen
          </Button>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {frames.slice(0, 8).map((f) => (
            <img
              key={f.storage_path}
              src={imgUrls[f.storage_path]}
              alt=""
              className="h-16 w-16 shrink-0 rounded-md object-cover"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <Smartphone className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">Legg til en 360°-visning (valgfritt)</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Skann QR-koden med mobilen for å ta opptak av kjøretøyet rundt hele veien — kjøpere kan
        deretter dra for å rotere det på annonsesiden.
      </p>
      {qrSrc ? (
        <div className="flex flex-col items-center gap-2">
          <img
            src={qrSrc}
            alt="QR-kode for 360°-opptak"
            width={180}
            height={180}
            className="rounded-md"
          />
          {framesQuery.isFetching && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Venter på bilder fra mobilen…
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={startSession}
          >
            <RefreshCw className="size-3.5" /> Generer ny QR-kode
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={startSession}
          disabled={creating || generating}
          className="gap-2"
        >
          {(creating || generating) && <Loader2 className="size-4 animate-spin" />}
          Vis QR-kode
        </Button>
      )}
    </div>
  );
}
