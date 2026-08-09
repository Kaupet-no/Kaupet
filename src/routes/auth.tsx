import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Turnstile } from "@marsidev/react-turnstile";
import { isNative } from "@/lib/native";
import { formatErrorMessage } from "@/lib/errors";
import { passwordStrength } from "@/lib/password-strength";
import { passwordSchema } from "@/lib/auth-schemas";

const TERMS_VERSION = "1.0";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "reset"]).optional().default("signin"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Logg inn — Kaupet.no" },
      { name: "description", content: "Logg inn eller bli medlem på Kaupet.no." },
    ],
  }),
  component: AuthPage,
});

type AuthMode = "signin" | "signup" | "reset" | "resend" | "confirm";

const emailField = z
  .string()
  .trim()
  .min(1, "Fyll inn e-postadressen din")
  .email("Skriv inn en gyldig e-postadresse");

const signInSchema = z.object({
  displayName: z.string().optional(),
  email: emailField,
  // Only checks presence here — the account may have been created back when
  // a shorter password was allowed, so this must never reject a legitimate
  // existing password. Actual correctness is checked server-side.
  password: z.string().min(1, "Skriv inn passordet ditt"),
  acceptedTerms: z.boolean().optional(),
});

const signUpSchema = signInSchema.extend({
  displayName: z.string().trim().max(50, "Maks 50 tegn").optional().or(z.literal("")),
  password: passwordSchema,
  acceptedTerms: z.boolean().refine((v) => v === true, {
    message: "Du må godta brukervilkårene og personvernerklæringen for å opprette konto.",
  }),
});

type AuthForm = z.infer<typeof signInSchema>;

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState<AuthMode>(mode);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileEnabled = !!import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const isSignUp = authMode === "signup";

  useEffect(() => setAuthMode(mode), [mode]);

  // Signin/signup/reset er deep-linkbare via ?mode= — bytt via navigate slik at
  // URL-en og nettleserens tilbake-knapp følger den viste modusen. Resend/confirm
  // er forbigående lokale tilstander uten egen URL.
  const goToMode = (next: "signin" | "signup" | "reset") =>
    navigate({ to: "/auth", search: { mode: next } });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const resolver = useMemo(() => zodResolver(isSignUp ? signUpSchema : signInSchema), [isSignUp]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    trigger,
    clearErrors,
    formState: { errors },
  } = useForm<AuthForm>({
    resolver,
    mode: "onTouched",
    defaultValues: { displayName: "", email: "", password: "", acceptedTerms: false },
  });

  const password = watch("password") ?? "";
  const acceptedTerms = watch("acceptedTerms") ?? false;

  // Feltkrav endres når modusen byttes; fjern gamle feilmeldinger.
  useEffect(() => {
    clearErrors();
    setTurnstileToken(null);
  }, [authMode, clearErrors]);

  const webOrigin = () => (isNative() ? "https://kaupet.no" : window.location.origin);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await trigger("email"))) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(getValues("email"), {
        redirectTo: `${webOrigin()}/tilbakestill-passord`,
      });
      if (error) throw error;
      showSuccessToast(
        "Hvis adressen er registrert, har vi sendt en e-post med lenke for å sette nytt passord.",
      );
    } catch (err: unknown) {
      showErrorToast(formatErrorMessage(err, "Kunne ikke sende e-post. Prøv igjen."));
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!(await trigger("email"))) return;
    setResendLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: getValues("email"),
        options: { emailRedirectTo: isNative() ? "https://kaupet.no/" : window.location.origin },
      });
      if (error) throw error;
      showSuccessToast("Bekreftelses-e-post sendt på nytt. Sjekk innboksen din.");
    } catch (err: unknown) {
      showErrorToast(formatErrorMessage(err, "Kunne ikke sende e-post. Prøv igjen."));
    } finally {
      setResendLoading(false);
    }
  };

  const onSubmit = async (values: AuthForm) => {
    if (turnstileEnabled && !turnstileToken) {
      showErrorToast("Vent til bot-sjekken er fullført, og prøv igjen.");
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            emailRedirectTo: isNative() ? "https://kaupet.no/" : window.location.origin,
            captchaToken: turnstileToken ?? undefined,
            data: {
              display_name: values.displayName || values.email.split("@")[0],
              terms_accepted_version: TERMS_VERSION,
              terms_accepted_at: new Date().toISOString(),
            },
          },
        });
        if (error) throw error;
        setAuthMode("confirm");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
          options: { captchaToken: turnstileToken ?? undefined },
        });
        if (error) throw error;
        showSuccessToast("Velkommen tilbake!");
        navigate({ to: "/", replace: true });
      }
    } catch (err: unknown) {
      showErrorToast(formatErrorMessage(err, "Noe gikk galt. Prøv igjen."));
      setTurnstileToken(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-3xl tracking-tight">
          {authMode === "reset"
            ? "Glemt passord"
            : authMode === "resend"
              ? "Bekreft e-post"
              : authMode === "confirm"
                ? "Sjekk e-posten din"
                : isSignUp
                  ? "Bli medlem"
                  : "Logg inn"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {authMode === "reset"
            ? "Skriv inn e-postadressen din, så sender vi deg en lenke for å sette nytt passord."
            : authMode === "resend"
              ? "Skriv inn e-postadressen din, så sender vi deg en ny bekreftelseslenke."
              : authMode === "confirm"
                ? "Vi har sendt en bekreftelseslenke til e-postadressen din. Klikk på lenken for å aktivere kontoen."
                : isSignUp
                  ? "Det tar bare et halvt minutt og er helt gratis."
                  : "Velkommen tilbake til Kaupet."}
        </p>

        {authMode === "confirm" ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => goToMode("signin")}
            >
              ← Tilbake til innlogging
            </button>
          </p>
        ) : authMode === "reset" ? (
          <>
            <form onSubmit={handlePasswordReset} className="mt-6 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-post</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="kari@eksempel.no"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  {...register("email")}
                />
                {errors.email && (
                  <p id="email-error" className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full gap-2" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                Send lenke
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => goToMode("signin")}
              >
                ← Tilbake til innlogging
              </button>
            </p>
          </>
        ) : authMode === "resend" ? (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleResendConfirmation();
              }}
              className="mt-6 space-y-4"
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">E-post</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="kari@eksempel.no"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  {...register("email")}
                />
                {errors.email && (
                  <p id="email-error" className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full gap-2" disabled={resendLoading}>
                {resendLoading && <Loader2 className="size-4 animate-spin" />}
                Send bekreftelses-e-post på nytt
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setAuthMode("signin")}
              >
                ← Tilbake til innlogging
              </button>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            {isSignUp && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Visningsnavn</Label>
                <Input
                  id="name"
                  placeholder="Kari Nordmann"
                  aria-invalid={!!errors.displayName}
                  aria-describedby={errors.displayName ? "name-error" : undefined}
                  {...register("displayName")}
                />
                {errors.displayName && (
                  <p id="name-error" className="text-sm text-destructive">
                    {errors.displayName.message}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">E-post</Label>
              <Input
                id="email"
                type="email"
                placeholder="kari@eksempel.no"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                {...register("email")}
              />
              {errors.email && (
                <p id="email-error" className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Passord</Label>
                {!isSignUp && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => goToMode("reset")}
                  >
                    Glemt passord?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : undefined}
                {...register("password")}
              />
              {errors.password && (
                <p id="password-error" className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
              {!isSignUp && (
                <p className="text-xs text-muted-foreground">
                  Ikke bekreftet e-postadressen din?{" "}
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => setAuthMode("resend")}
                  >
                    Send bekreftelse på nytt
                  </button>
                </p>
              )}
              {isSignUp && password.length > 0 && (
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
            {isSignUp && (
              <div className="space-y-1.5">
                <label className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    id="accept-terms"
                    checked={acceptedTerms}
                    onCheckedChange={(v) =>
                      setValue("acceptedTerms", v === true, { shouldValidate: true })
                    }
                    aria-invalid={!!errors.acceptedTerms}
                    aria-describedby={errors.acceptedTerms ? "accept-terms-error" : undefined}
                    className="mt-0.5"
                  />
                  <span>
                    Jeg har lest og godtar{" "}
                    <Link
                      to="/vilkar"
                      target="_blank"
                      className="underline text-foreground hover:text-primary"
                    >
                      brukervilkårene
                    </Link>{" "}
                    og{" "}
                    <Link
                      to="/personvern"
                      target="_blank"
                      className="underline text-foreground hover:text-primary"
                    >
                      personvernerklæringen
                    </Link>
                    .
                  </span>
                </label>
                {errors.acceptedTerms && (
                  <p id="accept-terms-error" className="text-sm text-destructive">
                    {errors.acceptedTerms.message}
                  </p>
                )}
              </div>
            )}
            {turnstileEnabled && (
              <Turnstile
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                onSuccess={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken(null)}
                options={{ size: "invisible" }}
              />
            )}
            <Button
              type="submit"
              className="w-full gap-2"
              disabled={
                loading || (isSignUp && !acceptedTerms) || (turnstileEnabled && !turnstileToken)
              }
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {isSignUp ? "Opprett konto" : "Logg inn"}
            </Button>
          </form>
        )}

        {authMode !== "reset" && authMode !== "resend" && authMode !== "confirm" && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isSignUp ? "Har du allerede en konto? " : "Ny på Kaupet? "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => goToMode(isSignUp ? "signin" : "signup")}
            >
              {isSignUp ? "Logg inn" : "Bli medlem"}
            </button>
          </p>
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
