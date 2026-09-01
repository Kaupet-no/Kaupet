import { normalizeOrganizationNumber } from "@/lib/organization-number";

export type BrregOrganization = {
  organizationNumber: string;
  legalName: string;
  postalCode: string | null;
  city: string | null;
};

const NOT_FOUND_MESSAGE = "Fant ingen bedrift med dette organisasjonsnummeret.";
const UNAVAILABLE_MESSAGE = "Vi fikk ikke kontakt med Brønnøysundregistrene. Prøv igjen senere.";
const BRREG_TIMEOUT_MS = 10_000;

type BrregAddress = {
  postnummer?: unknown;
  poststed?: unknown;
};

type BrregPayload = {
  navn?: unknown;
  forretningsadresse?: unknown;
  postadresse?: unknown;
};

function addressValues(address: unknown): { postalCode: string; city: string } | null {
  if (!address || typeof address !== "object") return null;
  const candidate = address as BrregAddress;
  if (
    typeof candidate.postnummer !== "string" ||
    !/^\d{4}$/.test(candidate.postnummer) ||
    typeof candidate.poststed !== "string" ||
    candidate.poststed.trim().length === 0
  ) {
    return null;
  }
  return { postalCode: candidate.postnummer, city: candidate.poststed.trim() };
}

/** Fetches only the public organization fields needed by business signup. */
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
    const address = addressValues(payload.forretningsadresse) ?? addressValues(payload.postadresse);
    return {
      organizationNumber: normalizedOrganizationNumber,
      legalName: payload.navn.trim(),
      postalCode: address?.postalCode ?? null,
      city: address?.city ?? null,
    };
  } catch (error) {
    if (error instanceof Error && error.message === NOT_FOUND_MESSAGE) throw error;
    if (error instanceof Error && error.message === UNAVAILABLE_MESSAGE) throw error;
    throw new Error(UNAVAILABLE_MESSAGE, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}
