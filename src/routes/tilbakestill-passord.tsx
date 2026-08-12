import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatErrorMessage } from "@/lib/errors";
import { passwordStrength } from "@/lib/password-strength";
import { passwordSchema } from "@/lib/auth-schemas";

const resetSchema = z.object({ password: passwordSchema });
type ResetForm = z.infer<typeof resetSchema>;

export const Route = createFileRoute("/tilbakestill-passord")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Sett nytt passord — Kaupet.no" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPasswordPage,
});

type SessionState = "checking" | "ready" | "missing";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "" },
  });
  const password = useWatch({ control, name: "password" }) ?? "";

  // Gjenopprettingslenken gir en midlertidig sesjon via URL-hash; supabase-js
  // plukker den opp asynkront, så vi venter litt før vi konkluderer med utløpt lenke.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setSessionState("ready");
        return;
      }
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session && !cancelled) setSessionState("ready");
      });
      const timeout = setTimeout(() => {
        if (!cancelled) setSessionState((s) => (s === "checking" ? "missing" : s));
      }, 3000);
      return () => {
        subscription.unsubscribe();
        clearTimeout(timeout);
      };
    };
    const cleanupPromise = check();
    return () => {
      cancelled = true;
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, []);

  const onSubmit = async (values: ResetForm) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) throw error;
      showSuccessToast("Passordet er oppdatert. Du er nå logget inn.");
      navigate({ to: "/", replace: true });
    } catch (err: unknown) {
      showErrorToast(formatErrorMessage(err, "Kunne ikke oppdatere passordet. Prøv igjen."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-3xl tracking-tight">Sett nytt passord</h1>

        {sessionState === "checking" && (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Bekrefter lenken…
          </div>
        )}

        {sessionState === "missing" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Lenken er ugyldig eller utløpt. Be om en ny lenke for å sette nytt passord.
            </p>
            <Button asChild className="w-full">
              <Link to="/auth" search={{ mode: "reset" }}>
                Be om ny lenke
              </Link>
            </Button>
          </div>
        )}

        {sessionState === "ready" && (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nytt passord</Label>
              <Input
                id="new-password"
                type="password"
                autoFocus
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "new-password-error" : undefined}
                {...register("password")}
              />
              {errors.password && (
                <p id="new-password-error" className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
              {password.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full ${
                          passwordStrength(password).score >= i ? "bg-primary" : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Passordstyrke: {passwordStrength(password).label}
                  </p>
                </div>
              )}
            </div>
            <Button type="submit" className="w-full gap-2" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Lagre nytt passord
            </Button>
          </form>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:underline">
          ← Tilbake til forsiden
        </Link>
      </p>
    </div>
  );
}
