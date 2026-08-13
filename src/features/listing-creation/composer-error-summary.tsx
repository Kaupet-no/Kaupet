import { useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ComposerErrorSummary({ message }: { message: string | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message) requestAnimationFrame(() => ref.current?.focus());
  }, [message]);

  if (!message) return null;

  return (
    <Alert ref={ref} variant="destructive" tabIndex={-1} className="mt-4">
      <AlertCircle className="size-4" aria-hidden />
      <AlertTitle>Kontroller opplysningene</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
