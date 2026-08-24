import { ShieldCheck } from "lucide-react";

type Props =
  { context: "contact"; messageCount?: never } | { context: "conversation"; messageCount: number };

export function TradeSafetyAdvice(props: Props) {
  if (props.context === "conversation" && props.messageCount > 0) return null;

  return (
    <aside
      role="note"
      aria-label="Råd for trygg handel"
      className="mx-auto flex max-w-md items-start gap-2 text-xs leading-relaxed text-muted-foreground"
    >
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {props.context === "contact" ? (
        <p>Vær forsiktig med forskuddsbetaling, særlig ved sending.</p>
      ) : (
        <p>
          Møt på et offentlig sted ved overlevering. Kontroller varen før du betaler. Vær forsiktig
          med forskuddsbetaling, særlig ved sending.
        </p>
      )}
    </aside>
  );
}
