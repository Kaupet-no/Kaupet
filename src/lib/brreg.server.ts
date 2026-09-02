import { normalizeOrganizationNumber } from "@/lib/organization-number";

export type BrregAddress = {
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
};

export type BrregOrganization = {
  organizationNumber: string;
  legalName: string;
  visitingAddress: BrregAddress;
  billingAddress: BrregAddress;
  // Kept as aliases for the signup contract until its UI cutover.
  postalCode: string | null;
  city: string | null;
};

const NOT_FOUND_MESSAGE = "Fant ingen bedrift med dette organisasjonsnummeret.";
const UNAVAILABLE_MESSAGE = "Vi fikk ikke kontakt med Brønnøysundregistrene. Prøv igjen senere.";
const BRREG_TIMEOUT_MS = 10_000;

type BrregRawAddress = {
  adresse?: unknown;
  postnummer?: unknown;
  poststed?: unknown;
};

type BrregPayload = {
  navn?: unknown;
  forretningsadresse?: unknown;
  postadresse?: unknown;
};

function addressValues(address: unknown): BrregAddress | null {
  if (!address || typeof address !== "object") return null;
  const candidate = address as BrregRawAddress;
  const postalCode =
    typeof candidate.postnummer === "string" && /^\d{4}$/.test(candidate.postnummer)
      ? candidate.postnummer
      : null;
  const city =
    typeof candidate.poststed === "string" && candidate.poststed.trim().length > 0
      ? candidate.poststed.trim()
      : null;
  const addressLine = Array.isArray(candidate.adresse)
    ? candidate.adresse
        .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
        .join(", ") || null
    : null;
  if (!postalCode && !city && !addressLine) return null;
  return { addressLine, postalCode, city };
}

function addressOrFallback(primary: unknown, fallback: unknown): BrregAddress {
  return (
    addressValues(primary) ??
    addressValues(fallback) ?? {
      addressLine: null,
      postalCode: null,
      city: null,
    }
  );
}

/** Fetches public registry data needed by business signup and profile repair. */
export async function fetchOrganizationFromBrreg(
  organizationNumber: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BrregOrganization> {
  const normalizedOrganizationNumber = normalizeOrganizationNumber(organizationNumber);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRREG_TIMEOUT_MS);

  try {
    const response = await fetchImpl(
      `https://data.brreg.no/enhetsregisteret/api/enheter/${normalizedOrganizationNumber}`,
      { signal: controller.signal },
    );
    if (response.status === 404) throw new Error(NOT_FOUND_MESSAGE);
    if (!response.ok) throw new Error(UNAVAILABLE_MESSAGE);

    let payload: BrregPayload;
    try {
      payload = (await response.json()) as BrregPayload;
    } catch {
      throw new Error(UNAVAILABLE_MESSAGE);
    }

    if (typeof payload.navn !== "string" || payload.navn.trim().length === 0) {
      throw new Error(UNAVAILABLE_MESSAGE);
    }

    const visitingAddress = addressOrFallback(payload.forretningsadresse, payload.postadresse);
    const billingAddress = addressOrFallback(payload.postadresse, payload.forretningsadresse);
    return {
      organizationNumber: normalizedOrganizationNumber,
      legalName: payload.navn.trim(),
      visitingAddress,
      billingAddress,
      postalCode: visitingAddress.postalCode,
      city: visitingAddress.city,
    };
  } catch (error) {
    if (error instanceof Error && error.message === NOT_FOUND_MESSAGE) throw error;
    if (error instanceof Error && error.message === UNAVAILABLE_MESSAGE) throw error;
    throw new Error(UNAVAILABLE_MESSAGE, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}
