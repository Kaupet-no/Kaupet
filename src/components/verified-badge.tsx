import { ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  verifiedAt?: string;
  size?: "sm" | "md";
  showLabel?: boolean;
};

export function VerifiedBadge({ verifiedAt, size = "sm", showLabel = true }: Props) {
  const date = verifiedAt
    ? new Date(verifiedAt).toLocaleDateString("nb-NO", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const padding = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]";
  const icon = size === "md" ? "size-4" : "size-3.5";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 rounded-full bg-primary/10 font-medium text-primary ${padding}`}
            aria-label="Verifisert med Vipps"
          >
            <ShieldCheck className={icon} />
            {showLabel && <span>Verifisert med Vipps</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {date ? `Identitet bekreftet via Vipps ${date}` : "Identitet bekreftet via Vipps"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
