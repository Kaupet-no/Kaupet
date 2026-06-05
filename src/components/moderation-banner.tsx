import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useMyModerationStatus } from "@/lib/use-my-moderation-status";

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
      <div className="border-b border-destructive/40 bg-destructive/10 text-destructive">
        <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 text-sm">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-medium">Kontoen din er utestengt</p>
            <p className="text-destructive/90">
              {data.ban_reason
                ? `Begrunnelse: ${data.ban_reason}`
                : "Du kan ikke opprette annonser, samtaler eller meldinger."}
              {" "}Ta kontakt på{" "}
              <a
                href="mailto:andreas@happypixel.no"
                className="underline underline-offset-2"
              >
                andreas@happypixel.no
              </a>
              {" "}hvis du mener dette er en feil.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (data.is_suspended && data.suspension_expires_at) {
    return (
      <div className="border-b border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
        <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-medium">Kontoen din er midlertidig svartelistet</p>
            <p>
              Du kan ikke opprette nye annonser eller sende meldinger frem til{" "}
              <span className="font-medium">
                {formatDate(data.suspension_expires_at)}
              </span>
              .
              {data.suspension_reason
                ? ` Begrunnelse: ${data.suspension_reason}`
                : ""}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
