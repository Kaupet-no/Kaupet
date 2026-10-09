import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authLinkError, initialAuthLinkError } from "@/lib/auth-link-error";

// These pages explain their own link errors.
const PAGES_WITH_OWN_ERROR = new Set(["/bedriftsinvitasjon", "/tilbakestill-passord"]);

export function AuthLinkErrorBanner() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [error, setError] = useState<{ message: string; pathname: string } | null>(null);
  useEffect(() => {
    const show = (message: string | null) => {
      if (message) setError({ message, pathname: window.location.pathname });
    };
    // The SDK may consume the fragment before hydration; the import-time read keeps it.
    show(initialAuthLinkError);
    const check = () => show(authLinkError(window.location.search, window.location.hash));
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
  // Shown only on the page the link opened; navigating away or closing it dismisses it for good.
  if (error && error.pathname !== pathname) setError(null);
  if (!error || error.pathname !== pathname || PAGES_WITH_OWN_ERROR.has(pathname)) return null;
  return (
    <Alert variant="destructive" className="mx-auto flex max-w-3xl items-start gap-2">
      <div className="flex-1">
        <AlertTitle>Lenken kunne ikke åpnes</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Lukk meldingen"
        onClick={() => setError(null)}
      >
        <X aria-hidden="true" />
      </Button>
    </Alert>
  );
}
