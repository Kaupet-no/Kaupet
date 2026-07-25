import { createFileRoute } from "@tanstack/react-router";

import { getVehicle360CaptureSession } from "@/lib/vehicle-360.functions";
import { Vehicle360CaptureFlow } from "@/features/vehicle-360-capture/capture-flow";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/360-opptak/$token")({
  loader: async ({ params }) => {
    const session = await getVehicle360CaptureSession({ data: { token: params.token } });
    return session;
  },
  component: CapturePage,
  errorComponent: CaptureError,
  head: () => ({
    meta: [{ title: "360°-opptak — Kaupet.no" }, { name: "robots", content: "noindex" }],
  }),
});

function CapturePage() {
  const { token } = Route.useParams();
  const { listingTitle, nextFrameOrder } = Route.useLoaderData();
  return (
    <Vehicle360CaptureFlow
      token={token}
      listingTitle={listingTitle}
      startFrameOrder={nextFrameOrder}
    />
  );
}

function CaptureError({ error }: { error: Error }) {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="font-display text-xl">Kunne ikke starte opptaket</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <p className="mt-4 text-sm text-muted-foreground">
        Gå tilbake til datamaskinen og generer en ny QR-kode på annonsen.
      </p>
      <Button className="mt-6" variant="outline" onClick={() => window.location.reload()}>
        Prøv på nytt
      </Button>
    </div>
  );
}
