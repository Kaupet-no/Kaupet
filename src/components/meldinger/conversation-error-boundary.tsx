import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { formatErrorMessage } from "@/lib/errors";

export function ConversationErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl">Kunne ikke laste samtalen</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {formatErrorMessage(error, "Prøv på nytt eller gå tilbake til innboksen.")}
      </p>
      <Button
        className="mt-6"
        onClick={() => {
          router.invalidate();
          reset();
        }}
      >
        Prøv på nytt
      </Button>
    </div>
  );
}
