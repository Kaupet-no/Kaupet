import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  className?: string;
  readOnly?: boolean;
};

export function StarRating({ value, onChange, size = 20, className, readOnly }: Props) {
  const isInteractive = !!onChange && !readOnly;
  return (
    <div className={cn("inline-flex items-center gap-0.5", className)} role={isInteractive ? "radiogroup" : undefined}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const Tag = isInteractive ? "button" : "span";
        return (
          <Tag
            key={n}
            type={isInteractive ? "button" : undefined}
            onClick={isInteractive ? () => onChange?.(n) : undefined}
            aria-label={isInteractive ? `${n} av 5 stjerner` : undefined}
            className={cn(
              "leading-none",
              isInteractive && "rounded transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <Star
              style={{ width: size, height: size }}
              className={cn(
                filled ? "fill-amber-400 text-amber-400" : "fill-transparent text-muted-foreground/40",
              )}
            />
          </Tag>
        );
      })}
    </div>
  );
}
