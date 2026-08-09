import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Camera as CameraIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { showErrorToast } from "@/lib/toast";
import { Vehicle360CaptureFlow } from "@/features/vehicle-360-capture/capture-flow";
import {
  createVehicle360CaptureSession,
  getVehicle360Frames,
} from "@/lib/vehicle/vehicle-360.functions";

/**
 * Native-only entry point for 360°-capture outside the desktop QR handoff
 * (`vehicle-360-qr-panel.tsx`): mints a session for a listing whose id is
 * already known (or can be created on demand via `ensureListingId`) and runs
 * `Vehicle360CaptureFlow` in a full-screen takeover, in-process — no QR code,
 * no `/360-opptak/:token` route involved. Used from the creation wizard
 * (draft not yet persisted) and from "Mine annonser"/published-listing edit
 * (listing id already known).
 */
export function Vehicle360CaptureLauncher({
  listingId,
  ensureListingId,
  listingTitle,
  label = "Ta 360°-opptak",
  variant = "outline",
  size = "default",
}: {
  listingId: string | null;
  ensureListingId?: () => Promise<string | null>;
  listingTitle: string;
  label?: string;
  variant?: "outline" | "ghost";
  size?: "default" | "sm" | "icon";
}) {
  const createSession = useServerFn(createVehicle360CaptureSession);
  const fetchFrames = useServerFn(getVehicle360Frames);
  const [session, setSession] = useState<{ token: string; startFrameOrder: number } | null>(null);
  const [starting, setStarting] = useState(false);

  const framesQuery = useQuery({
    queryKey: ["vehicle-360-frames", listingId],
    enabled: !!listingId,
    queryFn: () => fetchFrames({ data: { listingId: listingId! } }),
  });
  const frameCount = framesQuery.data?.length ?? 0;

  async function start() {
    setStarting(true);
    try {
      const id = listingId ?? (await ensureListingId?.()) ?? null;
      if (!id) {
        showErrorToast("Fyll ut kjøretøysopplysningene før du starter opptaket");
        return;
      }
      const { token } = await createSession({ data: { listingId: id } });
      setSession({ token, startFrameOrder: frameCount });
    } catch (e) {
      console.error("[vehicle-360] kunne ikke starte opptaksøkt", e);
      showErrorToast("Kunne ikke starte opptaket");
    } finally {
      setStarting(false);
    }
  }

  function close() {
    setSession(null);
    framesQuery.refetch();
  }

  if (session) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 z-10"
          aria-label="Lukk"
          onClick={close}
        >
          <X className="size-5" />
        </Button>
        <Vehicle360CaptureFlow
          token={session.token}
          listingTitle={listingTitle}
          startFrameOrder={session.startFrameOrder}
          onDone={close}
        />
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={size === "icon" ? undefined : "gap-2"}
      onClick={start}
      disabled={starting}
      aria-label={size === "icon" ? label : undefined}
    >
      <CameraIcon className="size-4" />
      {size !== "icon" && (frameCount > 0 ? "Fortsett 360°-opptak" : label)}
    </Button>
  );
}
