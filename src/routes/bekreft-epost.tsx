import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/bekreft-epost")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Bekreft e-post — Kaupet.no" }, { name: "robots", content: "noindex" }],
  }),
  component: ConfirmEmailPage,
});

type CallbackState = "checking" | "error";

function callbackErrorFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return Boolean(
    query.get("error") ||
    query.get("error_code") ||
    query.get("error_description") ||
    hash.get("error") ||
    hash.get("error_code") ||
    hash.get("error_description"),
  );
}

function ConfirmEmailPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<CallbackState>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeout: number | undefined;
    let subscription: { unsubscribe: () => void } | undefined;

    const routeVerifiedUser = async (session: Session) => {
      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("organization_id, role, status")
        .eq("user_id", session.user.id)
        .eq("role", "superuser")
        .eq("status", "active")
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership) {
        navigate({ to: "/", replace: true });
        return;
      }

      const { data: organization, error: organizationError } = await supabase
        .from("organizations")
        .select("selected_plan")
        .eq("id", membership.organization_id)
        .maybeSingle();
      if (organizationError) throw organizationError;
      if (cancelled) return;
      navigate({
        to: organization?.selected_plan ? "/bedrift" : "/bedrift/velg-plan",
        replace: true,
      });
    };

    const finish = async () => {
      if (callbackErrorFromUrl()) {
        setErrorMessage(
          "E-postbekreftelsen kunne ikke fullføres. Lenken kan være utløpt eller brukt.",
        );
        setState("error");
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) throw error;
      if (data.session) {
        await routeVerifiedUser(data.session);
        return;
      }

      const listener = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session || cancelled) return;
        void routeVerifiedUser(session).catch(() => {
          setErrorMessage("Kunne ikke kontrollere bedriftskontoen. Prøv igjen.");
          setState("error");
        });
      });
      subscription = listener.data.subscription;
      timeout = window.setTimeout(() => {
        if (!cancelled) {
          setErrorMessage("Bekreftelseslenken svarte ikke i tide. Prøv lenken på nytt.");
          setState("error");
        }
      }, 5000);
    };

    void finish().catch(() => {
      if (cancelled) return;
      setErrorMessage("Bekreftelsen kunne ikke fullføres. Prøv igjen.");
      setState("error");
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription?.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-3xl tracking-tight">Bekreft e-post</h1>
        {state === "checking" && (
          <p
            role="status"
            aria-live="polite"
            className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" />
            Bekrefter e-postadressen din…
          </p>
        )}
        {state === "error" && (
          <div className="mt-6 space-y-4">
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
            <Button type="button" className="w-full" onClick={() => window.location.reload()}>
              Prøv igjen
            </Button>
            <Button asChild type="button" variant="outline" className="w-full">
              <Link to="/auth" search={{ mode: "signin" }}>
                Gå til innlogging
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
