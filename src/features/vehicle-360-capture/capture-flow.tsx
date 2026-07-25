import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera as CameraIcon, Check, Loader2, RotateCw, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { compressImage } from "@/lib/image-compression";
import {
  MIN_360_FRAMES,
  TARGET_360_FRAMES,
  MAX_360_FRAMES,
  completeVehicle360CaptureSession,
  uploadVehicle360Frame,
} from "@/lib/vehicle-360.functions";

type Frame = {
  order: number;
  file: File;
  previewUrl: string;
  status: "captured" | "processing" | "done" | "error";
};

// Intervallet vi sjekker for bevegelse i — faktisk bildefangst skjer kun når
// nok bevegelse er registrert siden forrige bilde (se signature-sjekken
// nedenfor), så dette er en øvre grense på fangstrate, ikke et fast tempo.
const CAPTURE_INTERVAL_MS = 500;
// Nedskalert sammenligningsbilde brukt til bevegelsesdeteksjon — lite nok til
// at differansen regnes ut momentant på hver tikk.
const SIGNATURE_WIDTH = 32;
const SIGNATURE_HEIGHT = 24;
// Gjennomsnittlig pikseldifferanse (0–255) som kreves for å regne bildet som
// "nytt" — filtrerer bort dupliserte bilder når brukeren står stille eller
// beveger seg for sakte, uten å kreve gyroskop.
const MOVEMENT_THRESHOLD = 14;
// Hvor lenge vi venter etter Start (eller Fortsett) før vinkelen låses som
// referanse — brukeren har typisk akkurat rørt ved knappen, så telefonen
// kan være vippet i det øyeblikket selve trykket skjer.
const TILT_SETTLE_MS = 700;
// Maks avvik i grader (front/bak-helning) fra referansevinkelen før et bilde
// hoppes over — fanger opp at brukeren vipper telefonen opp/ned for å nå
// Start/Stopp-knappen, som ellers ville gitt et feilvinklet første/siste
// bilde og forstyrret 360°-visningen.
const TILT_THRESHOLD_DEG = 18;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Kunne ikke lese bildet"));
    reader.readAsDataURL(file);
  });
}

/** Nedskalert gråtone-signatur av gjeldende videobilde, brukt til å avgjøre
 * om kameraet har flyttet seg nok siden forrige fangede bilde. */
function grabSignature(
  video: HTMLVideoElement,
  signatureCanvas: HTMLCanvasElement,
): Uint8ClampedArray | null {
  const ctx = signatureCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, SIGNATURE_WIDTH, SIGNATURE_HEIGHT);
  const { data } = ctx.getImageData(0, 0, SIGNATURE_WIDTH, SIGNATURE_HEIGHT);
  const gray = new Uint8ClampedArray(SIGNATURE_WIDTH * SIGNATURE_HEIGHT);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = (data[o] + data[o + 1] + data[o + 2]) / 3;
  }
  return gray;
}

function signatureDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Full oppløsning rått bilde av gjeldende videobilde — ukomprimert, siden
 * komprimering skjer samlet først etter at opptaket er stoppet (se
 * `processPendingFrames`). Holder selve fangst-loopen rask og jevn. */
function videoFrameToRawFile(video: HTMLVideoElement): Promise<File | null> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve(null);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) =>
        resolve(blob ? new File([blob], `frame-${Date.now()}.jpg`, { type: "image/jpeg" }) : null),
      "image/jpeg",
      0.95,
    );
  });
}

/**
 * Opptaksflyt som skal føles som å filme objektet: et vedvarende
 * kamera-viewfinder (getUserMedia — ikke gjentatte kall til den native
 * bilde-plukkeren, som ville gitt et kontekstbytte per bilde) og automatisk
 * bildefangst mens brukeren går rundt kjøretøyet, med enkel bevegelses-
 * deteksjon som hopper over bilder når kameraet står stille.
 *
 * Bildene tas rått under selve filmingen (for jevn fangst uten
 * komprimerings-hakking) og komprimeres/lastes opp samlet rett etter at
 * brukeren trykker Stopp — se `processPendingFrames`. Dette gir god kontroll
 * på sluttstørrelsen (annonsen skal ikke ta unødvendig lagringsplass) uten
 * å gå på bekostning av oppløsningen bildene trenger for å se fine ut i
 * 360°-visningen på annonsesiden (se `vehicle360`-presetet i
 * image-compression.ts).
 */
export function Vehicle360CaptureFlow({
  token,
  listingTitle,
  startFrameOrder,
}: {
  token: string;
  listingTitle: string;
  startFrameOrder: number;
}) {
  const uploadFrame = useServerFn(uploadVehicle360Frame);
  const completeSession = useServerFn(completeVehicle360CaptureSession);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const capturingRef = useRef(false);
  const nextOrderRef = useRef(startFrameOrder);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSignatureRef = useRef<Uint8ClampedArray | null>(null);
  const processingRef = useRef(false);
  const currentBetaRef = useRef<number | null>(null);
  const baselineBetaRef = useRef<number | null>(null);
  const settleUntilRef = useRef<number>(0);
  const orientationSupportedRef = useRef(true);

  const [frames, setFrames] = useState<Frame[]>([]);
  const [recording, setRecording] = useState(false);
  const [waitingForMovement, setWaitingForMovement] = useState(false);
  const [waitingForLevel, setWaitingForLevel] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [done, setDone] = useState(false);

  const doneCount = frames.filter((f) => f.status === "done").length;
  const totalCount = frames.length;
  const hasEnough = doneCount >= MIN_360_FRAMES;
  const processedCount = frames.filter((f) => f.status === "done" || f.status === "error").length;

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.beta == null) return;
    currentBetaRef.current = e.beta;
  }, []);

  const stopStream = useCallback(() => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    lastSignatureRef.current = null;
    baselineBetaRef.current = null;
    window.removeEventListener("deviceorientation", handleOrientation);
    setWaitingForMovement(false);
    setWaitingForLevel(false);
  }, [handleOrientation]);

  // Komprimerer og laster opp alle rått-fangede bilder sekvensielt (unngår å
  // overbelaste enheten/nettverket med parallelle komprimeringsjobber).
  // Kjøres automatisk rett etter at brukeren trykker Stopp.
  const processPendingFrames = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    try {
      // Les gjeldende liste via functional update-triks: vi itererer over en
      // snapshot tatt før løkken starter, siden `frames` i closure kan være
      // stale mellom await-punktene.
      let pending: Frame[] = [];
      setFrames((prev) => {
        pending = prev.filter((f) => f.status === "captured");
        return prev;
      });
      for (const entry of pending) {
        setFrames((prev) =>
          prev.map((f) => (f.order === entry.order ? { ...f, status: "processing" } : f)),
        );
        try {
          const compressed = await compressImage(entry.file, "vehicle360");
          const base64Data = await fileToBase64(compressed);
          await uploadFrame({
            data: {
              token,
              frameOrder: entry.order,
              contentType: compressed.type as "image/jpeg" | "image/png" | "image/webp",
              base64Data,
            },
          });
          setFrames((prev) =>
            prev.map((f) => (f.order === entry.order ? { ...f, status: "done" } : f)),
          );
        } catch (e) {
          console.error("[vehicle-360] komprimering/opplasting feilet", e);
          setFrames((prev) =>
            prev.map((f) => (f.order === entry.order ? { ...f, status: "error" } : f)),
          );
        }
      }
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, [token, uploadFrame]);

  const startRecording = useCallback(async () => {
    setCameraError(null);
    try {
      // iOS 13+ krever eksplisitt tillatelse til orientasjonssensoren, som må
      // hentes fra selve brukerhandlingen (knappetrykket) — derfor helt i
      // starten av denne funksjonen, før andre await-punkter. Android og
      // øvrige nettlesere trenger ingen slik forespørsel.
      const DOE = window.DeviceOrientationEvent as unknown as
        { requestPermission?: () => Promise<"granted" | "denied"> } | undefined;
      if (typeof DOE?.requestPermission === "function") {
        try {
          orientationSupportedRef.current = (await DOE.requestPermission()) === "granted";
        } catch {
          orientationSupportedRef.current = false;
        }
      } else {
        orientationSupportedRef.current = typeof DeviceOrientationEvent !== "undefined";
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (!signatureCanvasRef.current) {
        const c = document.createElement("canvas");
        c.width = SIGNATURE_WIDTH;
        c.height = SIGNATURE_HEIGHT;
        signatureCanvasRef.current = c;
      }
      // Nullstill sammenligningsgrunnlaget ved (re)start slik at det aller
      // første bildet i en økt/fortsettelse alltid fanges, uansett om
      // kameraet har rukket å stå helt stille siden forrige gang.
      lastSignatureRef.current = null;
      baselineBetaRef.current = null;
      currentBetaRef.current = null;
      settleUntilRef.current = Date.now() + TILT_SETTLE_MS;
      if (orientationSupportedRef.current) {
        window.addEventListener("deviceorientation", handleOrientation);
      }
      setRecording(true);
      intervalRef.current = window.setInterval(async () => {
        if (capturingRef.current || !videoRef.current || !signatureCanvasRef.current) return;
        if (nextOrderRef.current - startFrameOrder >= MAX_360_FRAMES) {
          stopStream();
          setRecording(false);
          void processPendingFrames();
          return;
        }

        // Vent til telefonen har rukket å roe seg etter knappetrykket, og
        // lås så gjeldende vinkel som referanse — bilder tas først etter
        // dette, så selve oppstartsvippingen fanges aldri opp.
        if (Date.now() < settleUntilRef.current) {
          capturingRef.current = false;
          return;
        }
        if (orientationSupportedRef.current && baselineBetaRef.current == null) {
          if (currentBetaRef.current == null) {
            capturingRef.current = false;
            return;
          }
          baselineBetaRef.current = currentBetaRef.current;
        }

        capturingRef.current = true;

        const levelOk =
          !orientationSupportedRef.current ||
          baselineBetaRef.current == null ||
          currentBetaRef.current == null ||
          Math.abs(currentBetaRef.current - baselineBetaRef.current) <= TILT_THRESHOLD_DEG;
        setWaitingForLevel(!levelOk);
        if (!levelOk) {
          setWaitingForMovement(false);
          capturingRef.current = false;
          return;
        }

        const signature = grabSignature(videoRef.current, signatureCanvasRef.current);
        const prev = lastSignatureRef.current;
        const moved = !prev || !signature || signatureDiff(prev, signature) >= MOVEMENT_THRESHOLD;
        setWaitingForMovement(!moved);
        if (!moved) {
          capturingRef.current = false;
          return;
        }
        if (signature) lastSignatureRef.current = signature;
        const file = await videoFrameToRawFile(videoRef.current);
        capturingRef.current = false;
        if (file) {
          const order = nextOrderRef.current;
          nextOrderRef.current += 1;
          const previewUrl = URL.createObjectURL(file);
          setFrames((p) => [...p, { order, file, previewUrl, status: "captured" }]);
        }
      }, CAPTURE_INTERVAL_MS);
    } catch (e) {
      console.error("[vehicle-360] kamera-tilgang feilet", e);
      setCameraError(
        "Fikk ikke tilgang til kameraet. Sjekk at appen/nettleseren har kameratillatelse.",
      );
    }
  }, [startFrameOrder, stopStream, processPendingFrames, handleOrientation]);

  function stopRecording() {
    stopStream();
    setRecording(false);
    void processPendingFrames();
  }

  useEffect(() => stopStream, [stopStream]);

  async function finish() {
    setFinishing(true);
    try {
      await completeSession({ data: { token } });
      setDone(true);
      showSuccessToast("360°-opptaket er sendt til datamaskinen din");
    } catch {
      showErrorToast("Kunne ikke fullføre økten");
    } finally {
      setFinishing(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
        <Check className="size-10 text-primary" />
        <h1 className="font-display text-xl">Ferdig!</h1>
        <p className="text-sm text-muted-foreground">
          Gå tilbake til datamaskinen — 360°-bildene dukker opp der automatisk.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-6">
      <div className="space-y-1 text-center">
        <h1 className="font-display text-lg">360°-opptak</h1>
        <p className="text-sm text-muted-foreground">{listingTitle}</p>
      </div>

      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          muted
          playsInline
          className="size-full object-cover"
          style={{ display: recording || totalCount > 0 ? "block" : "none" }}
        />
        {!recording && totalCount === 0 && (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-white/70">
            <CameraIcon className="size-8" />
            <p className="text-sm">Kameraforhåndsvisning vises her</p>
          </div>
        )}
        {recording && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
            {waitingForLevel ? (
              <>
                <span className="size-2 rounded-full bg-yellow-400" /> Hold telefonen vannrett
              </>
            ) : waitingForMovement ? (
              <>
                <span className="size-2 rounded-full bg-yellow-400" /> Stå stille? Flytt deg videre…
              </>
            ) : (
              <>
                <span className="size-2 animate-pulse rounded-full bg-red-500" /> Filmer
              </>
            )}
          </div>
        )}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white">
          <RotateCw className="size-3.5" /> {totalCount} av ~{TARGET_360_FRAMES} bilder
        </div>
      </div>

      {cameraError && <p className="text-center text-sm text-destructive">{cameraError}</p>}

      <p className="text-center text-xs text-muted-foreground">
        Trykk Start og gå sakte én runde rundt kjøretøyet mens du holder telefonen vannrett rettet
        mot det. Bildene tas automatisk mens du beveger deg — vi venter med å ta bilde hvis du
        vipper telefonen (f.eks. for å nå knappen) eller står helt stille, slik at ingen bilder blir
        feilvinklet eller like. Trykk Stopp når du er tilbake der du startet — bildene komprimeres
        og lastes opp automatisk etterpå.
      </p>

      {processing && (
        <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
          <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary">
            <Loader2 className="size-4 animate-spin" /> Laster opp bilder ({processedCount}/
            {totalCount})…
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{
                width: `${totalCount > 0 ? (processedCount / totalCount) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Ikke lukk siden — dette tar bare et øyeblikk.
          </p>
        </div>
      )}

      {frames.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {frames.map((f) => (
            <li key={f.order} className="relative shrink-0">
              <img
                src={f.previewUrl}
                alt=""
                className={`h-14 w-14 rounded-md object-cover ${f.status === "error" ? "opacity-40" : ""}`}
              />
              {(f.status === "processing" || f.status === "captured") && (
                <Loader2 className="absolute inset-0 m-auto size-4 animate-spin text-white" />
              )}
            </li>
          ))}
        </ul>
      )}

      {!processing &&
        (!recording ? (
          <div className="space-y-2">
            <Button
              type="button"
              className="w-full gap-2"
              size="xl"
              onClick={startRecording}
              disabled={processing}
            >
              <CameraIcon className="size-6" />{" "}
              {totalCount === 0 ? "Start opptak" : "Fortsett opptak"}
            </Button>
            {totalCount > 0 && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={finish}
                disabled={!hasEnough || finishing || processing}
              >
                {finishing && <Loader2 className="mr-2 size-4 animate-spin" />}
                {hasEnough
                  ? "Fullfør"
                  : `Fullfør (${doneCount}/${MIN_360_FRAMES} minimum — fortsett opptaket)`}
              </Button>
            )}
          </div>
        ) : (
          <Button
            type="button"
            variant="destructive"
            className="w-full gap-2"
            size="xl"
            onClick={stopRecording}
          >
            <Square className="size-6" /> Stopp
          </Button>
        ))}
    </div>
  );
}
