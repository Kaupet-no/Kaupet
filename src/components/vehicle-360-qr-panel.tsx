import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, Smartphone, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { signVehicle360FrameUrls } from "@/lib/storage";
import { generateBrandedQrDataUrl } from "@/lib/qr";
import {
  createVehicle360CaptureSession,
  deleteVehicle360Frames,
  getVehicle360Frames,
} from "@/lib/vehicle/vehicle-360.functions";

/**
 * Desktop-only panel on the bildeopplastning-steget for Bil/MC-annonser:
 * genererer automatisk en QR-kode brukeren *kan* skanne med Kaupet-appen for
 * å ta opptak av en 360°-bildesekvens av kjøretøyet — helt valgfritt, ingen
 * knapp å trykke for å be om koden. Koden er permanent for annonseutkastet
 * (samme token gjenbrukes, se createVehicle360CaptureSession) — ikke en
 * tidsbegrenset engangskode brukeren må be om på nytt. Krever en persistert
 * draft, siden mobilopptaket knyttes til en ekte listing_id. `ensureDraftId`
 * løser dette automatisk for kjøretøy — tittelen genereres av
 * kjøretøysoppslaget (Årsmodell/Merke/Modell), ikke skrevet inn av brukeren
 * her (se computeVehicleTitle-fallbacket i saveDraftToSupabase).
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
  const [qrError, setQrError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const autoTriedRef = useRef(false);

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

  async function generateQr() {
    setQrError(null);
    try {
      const id = draftId ?? (await ensureDraftId());
      if (!id) return;
      const myGeneration = ++generationRef.current;
      setGenerating(true);
      setQrSrc(null);
      const { token } = await createSession({ data: { listingId: id } });
      const url = `https://kaupet.no/360-opptak/${token}`;
      const dataUrl = await generateBrandedQrDataUrl(url);
      if (generationRef.current === myGeneration) setQrSrc(dataUrl);
    } catch (e) {
      console.error("[vehicle-360] kunne ikke starte opptaksøkt", e);
      setQrError("Kunne ikke generere QR-kode.");
    } finally {
      setGenerating(false);
    }
  }

  // Genereres automatisk så snart et utkast finnes (eller kan opprettes) —
  // brukeren skal aldri måtte be om QR-koden, kun skanne den om de ønsker.
  useEffect(() => {
    if (autoTriedRef.current || frames.length > 0) return;
    autoTriedRef.current = true;
    void generateQr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, frames.length]);

  async function clearFrames() {
    if (!draftId) return;
    try {
      await deleteFrames({ data: { listingId: draftId } });
      showSuccessToast("360°-bildene ble fjernet");
      framesQuery.refetch();
      autoTriedRef.current = false;
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
            360°-visning klar — {frames.length} bilder mottatt fra Kaupet-appen
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
        Skann QR-koden med mobiltelefonen din for å benytte Kaupet-appen til å lage en 360-visning
        av kjøretøyet.
      </p>
      <div className="flex flex-col items-center gap-2">
        <div
          className="flex h-[180px] w-[180px] items-center justify-center rounded-md bg-white"
          aria-live="polite"
        >
          {generating && <Loader2 className="size-6 animate-spin text-muted-foreground" />}
          {!generating && qrError && (
            <span className="px-3 text-center text-xs text-destructive">{qrError}</span>
          )}
          {!generating && qrSrc && (
            <img
              src={qrSrc}
              alt="QR-kode for 360°-opptak i Kaupet-appen"
              width={180}
              height={180}
              className="rounded-md"
            />
          )}
          {!generating && !qrSrc && !qrError && (
            <span className="px-3 text-center text-xs text-muted-foreground">
              Fullfør kjøretøysoppslaget for å få QR-koden
            </span>
          )}
        </div>
        {!qrSrc && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={generateQr}
            disabled={generating}
          >
            <RefreshCw className="size-3.5" /> Prøv igjen
          </Button>
        )}
      </div>
    </div>
  );
}
