import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const BUSINESS_APPROVAL_MESSAGE =
  "Bedriften venter på godkjenning fra Kaupet. Annonser kan publiseres og importeres når bedriften er godkjent. Kontakt kontakt@kaupet.no hvis du trenger hjelp.";

export function BusinessApprovalNotice({ status }: { status?: "unverified" | "verified" }) {
  if (status !== "unverified") return null;
  return (
    <Alert variant="warning" role="status">
      <AlertTitle>Bedriften venter på godkjenning</AlertTitle>
      <AlertDescription>
        {BUSINESS_APPROVAL_MESSAGE} En Proff-prøveperiode starter med en gang du bestiller, også
        mens bedriften venter på godkjenning.
      </AlertDescription>
    </Alert>
  );
}
