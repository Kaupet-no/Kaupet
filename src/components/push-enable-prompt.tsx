import { Link } from "@tanstack/react-router";
import { BellRing, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { usePushStatus } from "@/lib/use-push-status";
import { Button } from "@/components/ui/button";
import { formatErrorMessage } from "@/lib/errors";

type Props = {
  /** "banner" = larger card for a dedicated page; "inline" = compact hint inside a dialog. */
  variant?: "banner" | "inline";
  showManageLink?: boolean;
};

/**
 * Shared push-notification opt-in prompt for saved searches. Renders nothing
 * once push is already active for this device, so it's safe to mount
 * unconditionally wherever a save/notify action happens.
 */
export function PushEnablePrompt({ variant = "inline", showManageLink = true }: Props) {
  const push = usePushStatus();
  const [busy, setBusy] = useState(false);

  if (push.loading || push.savedSearchesActive) return null;

  const enable = async () => {
    setBusy(true);
    try {
      await push.enableOnThisDevice("saved_searches");
      toast.success("Push-varsler er aktivert på denne enheten");
    } catch (e) {
      toast.error(formatErrorMessage(e, "Klarte ikke å aktivere varsler"));
    } finally {
      setBusy(false);
    }
  };

  let heading: string | null = null;
  let body: ReactNode;
  let actionLabel: string | null = null;

  if (!push.supported) {
    body = (
      <p>
        Push-varsler er ikke tilgjengelig i denne nettleseren. Du kan fortsatt lagre søket og motta
        varsler på andre enheter der du er logget inn.
      </p>
    );
  } else if (push.permission === "denied") {
    body = (
      <p>
        Du har blokkert varsler for kaupet.no i nettleseren. Endre tillatelsen i
        nettleserinnstillingene for å motta varsler her.
      </p>
    );
  } else if (!push.subscribedHere) {
    heading = "Aktiver push-varsler for å motta treffene";
    body = (
      <p>
        Push-varsler er ikke aktivert i nettleseren. Du vil ikke få beskjed når en ny annonse
        matcher.
      </p>
    );
    actionLabel = "Aktiver push-varsler";
  } else {
    heading = "Push-varsler for lagrede søk er av";
    body = <p>Slå på for å motta dem på denne enheten.</p>;
    actionLabel = "Slå på for lagrede søk";
  }

  return (
    <div
      className={
        variant === "banner"
          ? "flex gap-3 rounded-xl border border-border bg-card p-4"
          : "flex gap-2 rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground"
      }
    >
      <BellRing
        className={
          variant === "banner"
            ? "mt-0.5 size-5 shrink-0 text-primary"
            : "mt-0.5 size-4 shrink-0 text-primary"
        }
      />
      <div className="flex-1 space-y-2">
        {heading && (
          <p className={variant === "banner" ? "font-medium" : "font-medium text-foreground"}>
            {heading}
          </p>
        )}
        <div className={variant === "banner" ? "text-muted-foreground" : undefined}>{body}</div>
        {actionLabel && (
          <Button size="sm" type="button" onClick={enable} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {actionLabel}
          </Button>
        )}
        {showManageLink && (
          <p>
            <Link
              to="/profil"
              search={{ tab: "varslinger" } as never}
              className="text-xs underline underline-offset-2 text-muted-foreground"
            >
              Administrer varsler
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
