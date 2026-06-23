/**
 * Sentral feilmelding-formatter. Oversetter Zod-, Supabase- og nettverksfeil
 * til lesbare norske meldinger som er trygge å vise i en toast.
 */

type AnyError = unknown;

const FIELD_LABELS: Record<string, string> = {
  title: "Tittel",
  description: "Beskrivelse",
  category_id: "Kategori",
  condition: "Tilstand",
  is_free: "Pris",
  price_nok: "Pris",
  postal_code: "Postnummer",
  city: "Sted",
  email: "E-post",
  password: "Passord",
  display_name: "Navn",
  phone: "Telefon",
  name: "Navn",
  name_nb: "Navn",
  body: "Melding",
  rating: "Vurdering",
  comment: "Kommentar",
  query: "Søkeord",
  min_price: "Minstepris",
  max_price: "Makspris",
  lat: "Posisjon",
  lng: "Posisjon",
};

function labelFor(path: ReadonlyArray<string | number> | undefined): string | null {
  if (!path || path.length === 0) return null;
  const key = String(path[path.length - 1]);
  return FIELD_LABELS[key] ?? null;
}

function fromZodIssue(issue: {
  code?: string;
  message?: string;
  path?: ReadonlyArray<string | number>;
  minimum?: number;
  maximum?: number;
  type?: string;
}): string {
  const label = labelFor(issue.path);
  const prefix = label ? `${label}: ` : "";

  switch (issue.code) {
    case "too_small": {
      if (issue.type === "string") {
        return `${label ?? "Feltet"} må være minst ${issue.minimum} tegn`;
      }
      if (issue.type === "number") {
        return `${label ?? "Verdien"} må være minst ${issue.minimum}`;
      }
      return `${label ?? "Feltet"} er for kort`;
    }
    case "too_big": {
      if (issue.type === "string") {
        return `${label ?? "Feltet"} kan ikke være lengre enn ${issue.maximum} tegn`;
      }
      if (issue.type === "number") {
        return `${label ?? "Verdien"} kan ikke være større enn ${issue.maximum}`;
      }
      return `${label ?? "Feltet"} er for langt`;
    }
    case "invalid_type":
      return `${label ?? "Feltet"} mangler eller har feil format`;
    case "invalid_string":
      return `${label ?? "Feltet"} har ugyldig format`;
    case "invalid_enum_value":
      return `${label ?? "Feltet"} har en verdi som ikke er tillatt`;
    case "custom":
      return issue.message && !looksLikeJson(issue.message)
        ? `${prefix}${issue.message}`
        : `${label ?? "Feltet"} er ikke gyldig`;
    default:
      return issue.message && !looksLikeJson(issue.message)
        ? `${prefix}${issue.message}`
        : `${label ?? "Feltet"} er ikke gyldig`;
  }
}

function isZodError(
  err: AnyError,
): err is { issues: Array<Record<string, unknown>>; name?: string } {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; issues?: unknown };
  if (e.name === "ZodError") return true;
  if (Array.isArray(e.issues) && e.issues.length > 0) return true;
  return false;
}

function isPostgrestError(err: AnyError): err is {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
} {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  return (
    typeof e.code === "string" && (typeof e.message === "string" || typeof e.details === "string")
  );
}

function isAuthError(
  err: AnyError,
): err is { message: string; status?: number; __isAuthError?: boolean } {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  return (
    e.__isAuthError === true || (typeof e.status === "number" && typeof e.message === "string")
  );
}

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  return t.startsWith("[") || t.startsWith("{");
}

function looksTechnical(s: string): boolean {
  const lower = s.toLowerCase();
  return (
    lower.includes("duplicate key") ||
    lower.includes("permission denied") ||
    lower.includes("violates") ||
    lower.includes("syntax error") ||
    lower.includes('relation "') ||
    lower.includes('column "') ||
    lower.includes("null value in column") ||
    lower.includes("foreign key") ||
    lower.includes("postgrest") ||
    lower.includes("jwt") ||
    lower.includes("rls")
  );
}

function fromPostgresCode(code: string | undefined, fallback: string): string {
  switch (code) {
    case "23505":
      return "Denne verdien finnes allerede";
    case "23503":
      return "Handlingen kan ikke fullføres fordi data er i bruk et annet sted";
    case "23502":
      return "Et påkrevd felt mangler";
    case "23514":
      return "Verdien er ikke gyldig";
    case "42501":
    case "PGRST301":
    case "PGRST302":
      return "Du har ikke tilgang til denne handlingen";
    case "PGRST116":
      return "Fant ikke det du lette etter";
    case "22001":
      return "Innholdet er for langt";
    case "22P02":
      return "Ugyldig verdi";
    default:
      return fallback;
  }
}

function fromAuthMessage(message: string, fallback: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Feil e-post eller passord";
  if (lower.includes("user already registered") || lower.includes("already been registered"))
    return "Det finnes allerede en konto med denne e-posten";
  if (lower.includes("email not confirmed")) return "Bekreft e-posten din før du logger inn";
  if (lower.includes("email rate limit"))
    return "For mange e-poster sendt. Vent litt og prøv igjen";
  if (lower.includes("for security purposes") || lower.includes("rate limit"))
    return "For mange forsøk. Vent litt og prøv igjen";
  if (lower.includes("password should be at least")) {
    const m = message.match(/at least (\d+)/i);
    return m ? `Passordet må være minst ${m[1]} tegn` : "Passordet er for kort";
  }
  if (lower.includes("password") && lower.includes("weak"))
    return "Passordet er for svakt. Velg et sterkere passord";
  if (lower.includes("invalid email")) return "Ugyldig e-postadresse";
  if (lower.includes("user not found")) return "Fant ingen bruker med denne e-posten";
  if (lower.includes("token has expired") || lower.includes("expired"))
    return "Lenken er utløpt. Be om en ny";
  if (lower.includes("new password should be different"))
    return "Det nye passordet må være annerledes enn det gamle";
  if (lower.includes("signups not allowed") || lower.includes("signup is disabled"))
    return "Registrering er ikke tilgjengelig";
  if (lower.includes("unsupported provider")) return "Denne påloggingsmetoden er ikke tilgjengelig";
  if (lower.includes("network") || lower.includes("failed to fetch"))
    return "Ingen nettverksforbindelse. Prøv igjen";
  return fallback;
}

function isNetworkError(err: AnyError): boolean {
  if (!err) return false;
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) return true;
  const msg = (err as { message?: string }).message;
  if (typeof msg === "string" && /failed to fetch|networkerror|load failed/i.test(msg)) return true;
  return false;
}

function isPushDaemonError(err: AnyError): boolean {
  const msg = (err as { message?: string })?.message;
  return typeof msg === "string" && /push (service|daemon)/i.test(msg);
}

/**
 * Returnerer en norsk, brukervennlig feilmelding. Bruker `fallback` når
 * feilen ikke kan tolkes, eller når underliggende melding er ulesbar
 * (JSON, teknisk engelsk, eller tom).
 */
export function formatErrorMessage(err: AnyError, fallback: string): string {
  if (err == null) return fallback;

  if (isNetworkError(err)) {
    return "Ingen nettverksforbindelse. Prøv igjen";
  }

  if (isPushDaemonError(err)) {
    return "Nettleseren fikk ikke kontakt med varslingstjenesten. Start nettleseren på nytt, sjekk varslingsinnstillingene i operativsystemet eller nettleseren, og prøv igjen";
  }

  if (isZodError(err)) {
    const issues = (err as { issues: Array<Record<string, unknown>> }).issues;
    const first = issues[0] as Parameters<typeof fromZodIssue>[0];
    if (first) return fromZodIssue(first);
    return fallback;
  }

  if (isAuthError(err)) {
    return fromAuthMessage(err.message, fallback);
  }

  if (isPostgrestError(err)) {
    return fromPostgresCode(err.code, fallback);
  }

  if (typeof err === "string") {
    if (!err || looksLikeJson(err) || looksTechnical(err)) return fallback;
    return err;
  }

  const message = (err as { message?: unknown }).message;
  if (typeof message === "string" && message.length > 0) {
    if (looksLikeJson(message)) {
      // Forsøk å parse som ZodError-JSON
      try {
        const parsed = JSON.parse(message);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.code) {
          return fromZodIssue(parsed[0]);
        }
      } catch {
        // ignorer
      }
      return fallback;
    }
    if (looksTechnical(message)) return fallback;
    return message;
  }

  return fallback;
}
