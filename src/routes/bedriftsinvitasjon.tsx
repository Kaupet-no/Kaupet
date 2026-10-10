import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invitationTokens, supabase } from "@/integrations/supabase/client";
import { authLinkError } from "@/lib/auth-link-error";
import { acceptOrganizationInvite } from "@/lib/business/members.functions";
import { formatErrorMessage } from "@/lib/errors";
import { passwordSchema } from "@/lib/auth-schemas";

export const Route = createFileRoute("/bedriftsinvitasjon")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Bedriftsinvitasjon — Kaupet.no" }, { name: "robots", content: "noindex" }],
  }),
  component: BusinessInvitationPage,
});

type InvitationState = "checking" | "conflict" | "ready" | "error";
const invitationSchema = z.object({ password: passwordSchema });
type InvitationForm = z.infer<typeof invitationSchema>;

/** The `sub` claim of an access token; only compared with the signed-in user, never trusted. */
function tokenSubject(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(payload)) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

async function adoptInvitationSession() {
  const tokens = invitationTokens();
  if (!tokens) throw new Error("Invitasjonen er ugyldig, utløpt eller allerede brukt.");
  const { error } = await supabase.auth.setSession(tokens);
  if (error) throw error;
}

function BusinessInvitationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      if (authLinkError(window.location.search, window.location.hash)) {
        setErrorMessage("Invitasjonen er ugyldig, utløpt eller allerede brukt.");
        setState("error");
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) throw error;
      const tokens = invitationTokens();
      if (tokens) {
        const current = data.session?.user.id;
        if (current && current !== tokenSubject(tokens.access_token)) {
          setState("conflict");
          return;
        }
        await adoptInvitationSession();
        if (!cancelled) setState("ready");
        return;
      }
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

  async function switchToInvitedAccount() {
    setLoading(true);
    try {
      await supabase.auth.signOut({ scope: "local" });
      await adoptInvitationSession();
      setState("ready");
    } catch (error: unknown) {
      setErrorMessage(formatErrorMessage(error, "Invitasjonen kunne ikke åpnes. Prøv igjen."));
      setState("error");
    } finally {
      setLoading(false);
    }
  }

  const onSubmit = async (values: InvitationForm) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) throw error;
      await acceptOrganizationInvite();
      await queryClient.invalidateQueries({ queryKey: ["business-membership"] });
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
        {state === "conflict" && (
          <div className="mt-6 space-y-4">
            <p role="alert" className="text-sm">
              Du er logget inn med en annen konto enn den som er invitert. Logg ut for å godta
              invitasjonen med den inviterte kontoen.
            </p>
            <Button
              type="button"
              className="w-full gap-2"
              disabled={loading}
              onClick={() => void switchToInvitedAccount()}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              Logg ut og fortsett
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/">Avbryt</Link>
            </Button>
          </div>
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
