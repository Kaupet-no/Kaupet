import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { acceptOrganizationInvite } from "@/lib/business.functions";
import { formatErrorMessage } from "@/lib/errors";
import { passwordSchema } from "@/lib/auth-schemas";

export const Route = createFileRoute("/bedriftsinvitasjon")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Bedriftsinvitasjon — Kaupet.no" }, { name: "robots", content: "noindex" }],
  }),
  component: BusinessInvitationPage,
});

type InvitationState = "checking" | "ready" | "error";
const invitationSchema = z.object({ password: passwordSchema });
type InvitationForm = z.infer<typeof invitationSchema>;

function hasAuthErrorInUrl(): boolean {
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

function BusinessInvitationPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<InvitationState>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InvitationForm>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { password: "" },
  });

  useEffect(() => {
    let cancelled = false;
    let timeout: number | undefined;
    let subscription: { unsubscribe: () => void } | undefined;

    const markReady = (session: Session | null) => {
      if (cancelled || !session) return;
      setState("ready");
    };

    const checkSession = async () => {
      if (hasAuthErrorInUrl()) {
        setErrorMessage("Invitasjonen er ugyldig, utløpt eller allerede brukt.");
        setState("error");
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) throw error;
      if (data.session) {
        markReady(data.session);
        return;
      }

      const listener = supabase.auth.onAuthStateChange((_event, session) => markReady(session));
      subscription = listener.data.subscription;
      timeout = window.setTimeout(() => {
        if (cancelled) return;
        setErrorMessage("Invitasjonen svarte ikke i tide. Be om en ny invitasjon.");
        setState("error");
      }, 5000);
    };

    void checkSession().catch((error: unknown) => {
      if (cancelled) return;
      setErrorMessage(formatErrorMessage(error, "Invitasjonen kunne ikke åpnes. Prøv igjen."));
      setState("error");
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription?.unsubscribe();
    };
  }, []);

  const onSubmit = async (values: InvitationForm) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) throw error;
      await acceptOrganizationInvite();
      navigate({ to: "/bedrift", search: { tab: "oversikt" }, replace: true });
    } catch (error: unknown) {
      setErrorMessage(formatErrorMessage(error, "Kunne ikke godta invitasjonen. Prøv igjen."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-3xl tracking-tight">Bli med i bedriften</h1>
        {state === "checking" && (
          <p
            role="status"
            aria-live="polite"
            className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" />
            Bekrefter invitasjonen…
          </p>
        )}
        {state === "error" && (
          <div className="mt-6 space-y-4">
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
            <Button asChild className="w-full">
              <Link to="/auth" search={{ mode: "signin" }}>
                Gå til innlogging
              </Link>
            </Button>
          </div>
        )}
        {state === "ready" && (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Velg et passord for Kaupet-kontoen din for å godta invitasjonen.
            </p>
            {errorMessage && (
              <>
                <p role="alert" className="mt-4 text-sm text-destructive">
                  {errorMessage}
                </p>
                <Button asChild type="button" variant="outline" className="mt-4 w-full">
                  <Link to="/auth" search={{ mode: "signin" }}>
                    Gå til innlogging
                  </Link>
                </Button>
              </>
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="invitation-password">Nytt passord</Label>
                <Input
                  id="invitation-password"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "invitation-password-error" : undefined}
                  {...register("password")}
                />
                {errors.password && (
                  <p id="invitation-password-error" className="text-sm text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full gap-2" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                Godta invitasjon
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
