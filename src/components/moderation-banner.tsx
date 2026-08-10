import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useMyModerationStatus } from "@/hooks/use-my-moderation-status";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("nb-NO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ModerationBanner() {
  const { data } = useMyModerationStatus();
  if (!data) return null;

  if (data.is_banned) {
    return (
      <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
        <ShieldAlert className="size-5" />
        <div className="mx-auto max-w-6xl">
          <AlertTitle>Kontoen din er utestengt</AlertTitle>
          <AlertDescription>
            {data.ban_reason
              ? `Begrunnelse: ${data.ban_reason}`
              : "Du kan ikke opprette annonser, samtaler eller meldinger."}{" "}
            Ta kontakt på{" "}
            <a href="mailto:andreas@happypixel.no" className="underline underline-offset-2">
              andreas@happypixel.no
            </a>{" "}
            hvis du mener dette er en feil.
          </AlertDescription>
        </div>
      </Alert>
    );
  }

  if (data.is_suspended && data.suspension_expires_at) {
    return (
      <Alert variant="warning" className="rounded-none border-x-0 border-t-0">
        <AlertTriangle className="size-5" />
        <div className="mx-auto max-w-6xl">
          <AlertTitle>Kontoen din er midlertidig svartelistet</AlertTitle>
          <AlertDescription>
            Du kan ikke opprette nye annonser eller sende meldinger frem til{" "}
            <span className="font-medium">{formatDate(data.suspension_expires_at)}</span>.
            {data.suspension_reason ? ` Begrunnelse: ${data.suspension_reason}` : ""}
          </AlertDescription>
        </div>
      </Alert>
    );
  }

  return null;
}
