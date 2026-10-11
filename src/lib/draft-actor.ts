import { ClientError } from "@/lib/to-client-error";

export function assertDraftActor(expectedUserId: string | undefined, userId: string) {
  if (expectedUserId !== undefined && expectedUserId !== userId) {
    throw new ClientError(
      "Kontoen er endret. Logg inn med opprinnelig konto for å fortsette med utkastet.",
      409,
    );
  }
}

export function assertDraftOrganization(
  expected: string | null | undefined,
  actual: string | null,
) {
  if (expected !== undefined && expected !== actual) {
    throw new ClientError(
      "Bedriftstilknytningen er endret. Åpne annonsen på nytt med opprinnelig konto.",
      409,
    );
  }
}
