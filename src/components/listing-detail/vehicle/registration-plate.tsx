import { cn } from "@/lib/utils";

/** Formats a stored registration number ("DR98500") into the spaced,
 * human-readable form used on the physical plate ("DR 98500"). Falls back
 * to the raw value for formats that don't match the standard
 * 2-letter/4-5-digit pattern (vintage, personalized, or non-standard
 * plates), rather than mangling them. */
function formatRegistrationNumber(value: string): string {
  const match = /^([A-Z]{2})(\d{4,5})$/.exec(value.toUpperCase());
  return match ? `${match[1]} ${match[2]}` : value.toUpperCase();
}

/**
 * Read-only norsk kjennemerke-plate — gjenbruker det visuelle designet fra
 * registreringsflyten i annonseopprettelsen (`vehicle-registration/index.tsx`).
 * Rendres som en av tiles i `VehicleInfoGrid`, i stedet for en egen rad.
 */
export function RegistrationPlate({
  value,
  className,
  editable,
  onEdit,
}: {
  value: string;
  className?: string;
  /** Shows the dashed-border/hover edit affordance around the plate — the
   * owner-only inline-editing case, since changing the plate triggers an
   * external Statens Vegvesen lookup and opens a modal rather than editing
   * inline (see `vehicle-plate-edit-dialog.tsx`). */
  editable?: boolean;
  onEdit?: () => void;
}) {
  const plate = (
    <div
      className={cn(
        "@container flex aspect-[4.6/1] w-fit items-stretch overflow-hidden rounded-[3px] border border-black bg-white shadow-sm",
        !editable && className,
      )}
    >
      <div className="flex w-[17%] flex-col items-center justify-center gap-1 border-r border-black bg-blue-700">
        {/* Fra Flag_of_Norway.svg — geometri uendret, kun aria-hidden lagt til
            siden flagget er dekorativt her (kjennemerket har allerede
            "N"-landskoden som tekst). */}
        <svg viewBox="0 0 22 16" className="h-2 w-[11px] shrink-0" aria-hidden>
          <rect width="22" height="16" fill="#ba0c2f" />
          <path d="M0,8h22M8,0v16" stroke="#fff" strokeWidth="4" />
          <path d="M0,8h22M8,0v16" stroke="#00205b" strokeWidth="2" />
        </svg>
        <span className="shrink-0 text-[10px] font-bold leading-none text-white">N</span>
      </div>
      <span className="flex flex-1 items-center justify-center px-[3cqw] font-sans text-[13cqw] font-bold tracking-[0.1em] text-black">
        {formatRegistrationNumber(value)}
      </span>
    </div>
  );

  if (!editable) return plate;

  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "rounded-md border border-dashed border-border/60 p-0.5 transition-colors hover:border-primary/50 hover:bg-primary/5",
        className,
      )}
    >
      {plate}
    </button>
  );
}
