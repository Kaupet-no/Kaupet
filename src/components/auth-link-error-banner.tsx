import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { authLinkError, initialAuthLinkError } from "@/lib/auth-link-error";

export function AuthLinkErrorBanner() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const check = () =>
      setMessage(
        authLinkError(window.location.search, window.location.hash) ?? initialAuthLinkError,
      );
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert" className="mx-auto max-w-3xl">
      <AlertTitle>Lenken kunne ikke åpnes</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
