import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bindBusinessSignupEmail, lookupBusinessOrganization } from "@/lib/business.functions";
import { isValidOrganizationNumber, normalizeOrganizationNumber } from "@/lib/organization-number";
import { passwordSchema } from "@/lib/auth-schemas";
import { passwordStrength } from "@/lib/password-strength";
import { formatErrorMessage } from "@/lib/errors";
import { showSuccessToast } from "@/lib/toast";
import { isNative } from "@/lib/native";
import { supabase } from "@/integrations/supabase/client";
import { formatResendCooldown, useResendCooldown } from "@/hooks/use-resend-cooldown";

/* eslint-disable react-hooks/refs */
const TERMS_VERSION = "1.0";
const BUSINESS_TERMS_VERSION = "1.0";

type BusinessOrganization = {
  signupToken: string;
  organizationNumber: string;
  legalName: string;
  postalCode: string | null;
  city: string | null;
  expiresAt: string;
};

type BusinessStep = 1 | 2 | 3;

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Skriv inn navnet ditt (minst 2 tegn).")
    .max(80, "Maks 80 tegn."),
  email: z.string().trim().email("Skriv inn en gyldig e-postadresse."),
  password: passwordSchema,
  acceptedTerms: z.boolean().refine((value) => value, {
    message: "Du må godta vilkårene og personvernerklæringen.",
  }),
});
type ProfileForm = z.infer<typeof profileSchema>;

function formattedOrganizationNumber(value: string): string {
  const normalized = normalizeOrganizationNumber(value);
  return normalized.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
}

function webOrigin(): string {
  return isNative() ? "https://kaupet.no" : window.location.origin;
}

export function BusinessSignupFlow({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [step, setStep] = useState<BusinessStep>(1);
  const [organizationNumber, setOrganizationNumber] = useState("");
  const [organization, setOrganization] = useState<BusinessOrganization | null>(null);
  const [businessConfirmed, setBusinessConfirmed] = useState(false);
  const [organizationError, setOrganizationError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const resendCooldown = useResendCooldown();
  const [showPassword, setShowPassword] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const turnstileEnabled = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    mode: "onTouched",
    defaultValues: { displayName: "", email: "", password: "", acceptedTerms: false },
  });
  const password = useWatch({ control, name: "password" }) ?? "";
  const acceptedTerms = useWatch({ control, name: "acceptedTerms" }) ?? false;

  useEffect(() => {
    headingRef.current?.focus();
  }, [step, submittedEmail]);

  const getCaptchaToken = async () =>
    turnstileEnabled ? await turnstileRef.current?.getResponsePromise() : undefined;

  const handleLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    setOrganizationError(null);
    setStepError(null);
    const normalized = normalizeOrganizationNumber(organizationNumber);
    if (!isValidOrganizationNumber(normalized)) {
      setOrganizationError("Skriv inn et gyldig organisasjonsnummer med kontrollsiffer.");
      return;
    }

    setLookupLoading(true);
    try {
      const token = await getCaptchaToken();
      const result = await lookupBusinessOrganization({
        data: { organizationNumber: normalized, turnstileToken: token },
      });
      setOrganization(result);
      setStep(2);
    } catch (error: unknown) {
      setOrganizationError(formatErrorMessage(error, "Kunne ikke finne bedriften. Prøv igjen."));
    } finally {
      turnstileRef.current?.reset();
      setLookupLoading(false);
    }
  };

  const goBackToLookup = () => {
    setOrganization(null);
    setBusinessConfirmed(false);
    setStepError(null);
    setOrganizationError(null);
    setStep(1);
  };

  const onSubmit = async (values: ProfileForm) => {
    if (!organization) return;
    setSubmitLoading(true);
    setStepError(null);
    try {
      await bindBusinessSignupEmail({
        data: { signupToken: organization.signupToken, email: values.email.trim().toLowerCase() },
      });
      const token = await getCaptchaToken();
      const acceptedAt = new Date().toISOString();
      const { data, error } = await supabase.auth.signUp({
        email: values.email.trim(),
        password: values.password,
        options: {
          emailRedirectTo: `${webOrigin()}/bekreft-epost`,
          captchaToken: token ?? undefined,
          data: {
            display_name: values.displayName.trim(),
            terms_accepted_version: TERMS_VERSION,
            terms_accepted_at: acceptedAt,
            business_terms_accepted_version: BUSINESS_TERMS_VERSION,
            business_terms_accepted_at: acceptedAt,
            business_signup_token: organization.signupToken,
          },
        },
      });
      if (error) throw error;
      if (data.session) {
        await onAuthenticated();
      } else {
        setSubmittedEmail(values.email.trim());
      }
    } catch (error: unknown) {
      setStepError(formatErrorMessage(error, "Kunne ikke opprette profilen. Prøv igjen."));
    } finally {
      turnstileRef.current?.reset();
      setSubmitLoading(false);
    }
  };

  const resendConfirmation = async () => {
    if (!submittedEmail || resendCooldown.isCoolingDown) return;
    setResendLoading(true);
    setStepError(null);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: submittedEmail,
        options: { emailRedirectTo: `${webOrigin()}/bekreft-epost` },
      });
      if (error) throw error;
      resendCooldown.startCooldown();
      showSuccessToast("Bekreftelses-e-post sendt på nytt. Du kan sende en ny om fem minutter.");
    } catch (error: unknown) {
      setStepError(formatErrorMessage(error, "Kunne ikke sende e-post. Prøv igjen."));
    } finally {
      setResendLoading(false);
    }
  };

  if (submittedEmail) {
    return (
      <section aria-labelledby="business-signup-confirm-title" className="mt-6 space-y-4">
        <h2
          id="business-signup-confirm-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold outline-none"
        >
          Sjekk e-posten din
        </h2>
        <p className="text-sm text-muted-foreground">
          Vi har sendt en bekreftelseslenke til {submittedEmail}. Klikk på lenken for å aktivere
          kontoen din.
        </p>
        {stepError && (
          <p role="alert" className="text-sm text-destructive">
            {stepError}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={resendLoading || resendCooldown.isCoolingDown}
          onClick={() => void resendConfirmation()}
        >
          {resendLoading && <Loader2 className="size-4 animate-spin" />}
          {resendCooldown.isCoolingDown
            ? `Send bekreftelses-e-post på nytt om ${formatResendCooldown(resendCooldown.secondsRemaining)}`
            : "Send bekreftelses-e-post på nytt"}
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="business-signup-step-title" className="mt-6">
      <div
        className="mb-5 flex items-center justify-between text-sm text-muted-foreground"
        aria-label={`Steg ${step} av 3`}
      >
        <span className={step === 1 ? "font-medium text-foreground" : undefined}>
          1. Finn bedriften
        </span>
        <span className={step === 2 ? "font-medium text-foreground" : undefined}>2. Bekreft</span>
        <span className={step === 3 ? "font-medium text-foreground" : undefined}>3. Profil</span>
      </div>

      <h2
        id="business-signup-step-title"
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold outline-none"
      >
        {step === 1
          ? "Finn bedriften din"
          : step === 2
            ? "Bekreft bedriften"
            : "Opprett profilen din"}
      </h2>
      {stepError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {stepError}
        </p>
      )}

      {step === 1 && (
        <form onSubmit={(event) => void handleLookup(event)} className="mt-4 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="business-organization-number">Organisasjonsnummer</Label>
            <Input
              id="business-organization-number"
              inputMode="numeric"
              autoComplete="off"
              value={organizationNumber}
              onChange={(event) => {
                setOrganizationNumber(event.target.value);
                setOrganizationError(null);
              }}
              aria-invalid={Boolean(organizationError)}
              aria-describedby={
                organizationError ? "business-organization-number-error" : undefined
              }
              placeholder="974 760 673"
            />
            {organizationError && (
              <p
                id="business-organization-number-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {organizationError}
              </p>
            )}
          </div>
          {turnstileEnabled && (
            <Turnstile
              ref={turnstileRef}
              siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
              options={{ size: "invisible" }}
            />
          )}
          {lookupLoading && (
            <p
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              Søker i Brønnøysundregistrene…
            </p>
          )}
          <Button type="submit" className="w-full gap-2" disabled={lookupLoading}>
            {lookupLoading && <Loader2 className="size-4 animate-spin" />}
            Søk
          </Button>
        </form>
      )}

      {step === 2 && organization && (
        <div className="mt-4 space-y-4">
          <dl className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Juridisk navn</dt>
              <dd className="text-right font-medium">{organization.legalName}</dd>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <dt className="text-muted-foreground">Organisasjonsnummer</dt>
              <dd className="font-medium">
                {formattedOrganizationNumber(organization.organizationNumber)}
              </dd>
            </div>
            {(organization.postalCode || organization.city) && (
              <div className="mt-2 flex justify-between gap-4">
                <dt className="text-muted-foreground">Adresse</dt>
                <dd className="text-right font-medium">
                  {[organization.postalCode, organization.city].filter(Boolean).join(" ")}
                </dd>
              </div>
            )}
          </dl>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={businessConfirmed}
              onCheckedChange={(value) => setBusinessConfirmed(value === true)}
              required
              aria-label="Bekreft bedriften og fullmakt"
            />
            <span>
              Jeg bekrefter at dette er riktig bedrift, og at jeg har fullmakt til å opprette konto
              på vegne av bedriften.
            </span>
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={goBackToLookup}>
              Tilbake
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={!businessConfirmed}
              onClick={() => {
                if (!businessConfirmed) {
                  setStepError("Du må bekrefte bedriften og fullmakten.");
                  return;
                }
                setStepError(null);
                setStep(3);
              }}
            >
              Fortsett
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="business-display-name">Navn</Label>
            <Input
              id="business-display-name"
              autoComplete="name"
              aria-invalid={Boolean(errors.displayName)}
              aria-describedby={errors.displayName ? "business-display-name-error" : undefined}
              {...register("displayName")}
            />
            {errors.displayName && (
              <p id="business-display-name-error" className="text-sm text-destructive">
                {errors.displayName.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="business-email">E-post</Label>
            <Input
              id="business-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "business-email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p id="business-email-error" className="text-sm text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="business-password">Passord</Label>
            <div className="relative">
              <Input
                id="business-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                className="pr-10"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? "business-password-error" : "business-password-hint"
                }
                {...register("password")}
              />
              <button
                type="button"
                className="native-touch-target absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Skjul passord" : "Vis passord"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.password ? (
              <p id="business-password-error" className="text-sm text-destructive">
                {errors.password.message}
              </p>
            ) : (
              <p id="business-password-hint" className="text-xs text-muted-foreground">
                Minst 10 tegn
              </p>
            )}
            {password.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Passordstyrke: {passwordStrength(password).label}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <Checkbox
                id="business-accept-terms"
                checked={acceptedTerms}
                required
                onCheckedChange={(value) =>
                  setValue("acceptedTerms", value === true, { shouldValidate: true })
                }
                aria-invalid={Boolean(errors.acceptedTerms)}
                aria-describedby={errors.acceptedTerms ? "business-terms-error" : undefined}
                className="mt-0.5"
              />
              <span>
                Jeg godtar{" "}
                <a
                  href="/vilkar"
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline"
                >
                  brukervilkårene
                </a>{" "}
                og bekrefter at jeg har lest{" "}
                <a
                  href="/personvern"
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline"
                >
                  personvernerklæringen
                </a>
                .
              </span>
            </label>
            {errors.acceptedTerms && (
              <p id="business-terms-error" className="text-sm text-destructive">
                {errors.acceptedTerms.message}
              </p>
            )}
          </div>
          {turnstileEnabled && (
            <Turnstile
              ref={turnstileRef}
              siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
              options={{ size: "invisible" }}
            />
          )}
          <Button type="submit" className="w-full gap-2" disabled={submitLoading || !acceptedTerms}>
            {submitLoading && <Loader2 className="size-4 animate-spin" />}
            Opprett bedriftskonto
          </Button>
        </form>
      )}
    </section>
  );
}
