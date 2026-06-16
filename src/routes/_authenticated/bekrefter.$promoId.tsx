import { useEffect, useRef } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, AlertCircle } from "lucide-react";

import { reconcilePromotionPayment } from "@/lib/promotions.functions";
import { Button } from "@/components/ui/button";
import { formatErrorMessage } from "@/lib/errors";

const MAX_ATTEMPTS = 15; // ~30s med 2s mellomrom

export const Route = createFileRoute("/_authenticated/bekrefter/$promoId")({
  head: () => ({
    meta: [
      { title: "Bekrefter betaling — Kaupet.no" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Vi bekrefter Vipps-betalingen din." },
    ],
  }),
  component: ConfirmPage,
});

function ConfirmPage() {
  const { promoId } = Route.useParams();
  const router = useRouter();
  const reconcile = useServerFn(reconcilePromotionPayment);

  const attemptsRef = useRef(0);
  const navigatedRef = useRef(false);

  const mutation = useMutation({
    mutationFn: () => reconcile({ data: { promotion_id: promoId } }),
  });

  const goToReceipt = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    void router.navigate({
      to: "/kvittering/$promoId",
      params: { promoId },
      replace: true,
    });
  };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      attemptsRef.current += 1;
      try {
        const result = await mutation.mutateAsync();
        if (cancelled) return;
        if (result.status === "active" || result.status === "gifted" || result.status === "failed") {
          goToReceipt();
          return;
        }
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          goToReceipt();
          return;
        }
        timer = setTimeout(() => void tick(), 2000);
      } catch {
        if (cancelled) return;
        if (attemptsRef.current >= MAX_ATTEMPTS) return;
        timer = setTimeout(() => void tick(), 2000);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promoId]);

  const hardFailed = mutation.isError && attemptsRef.current >= MAX_ATTEMPTS;

  if (hardFailed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <AlertCircle className="mx-auto size-10 text-destructive" />
        <h1 className="mt-4 font-display text-2xl">Kunne ikke bekrefte akkurat nå</h1>
        <p className="mt-2 text-muted-foreground">
          {formatErrorMessage(mutation.error, "Ukjent feil")}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              attemptsRef.current = 0;
              mutation.reset();
              void router.invalidate();
            }}
          >
            Prøv igjen
          </Button>
          <Button asChild>
            <Link to="/mine-annonser">Mine annonser</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center"
    >
      <Loader2 className="size-12 animate-spin text-primary" aria-hidden="true" />
      <h1 className="mt-6 font-display text-2xl">Vi bekrefter betalingen din hos Vipps…</h1>
      <p className="mt-2 text-muted-foreground">
        Dette tar vanligvis bare et par sekunder. Ikke lukk vinduet.
      </p>
    </div>
  );
}
