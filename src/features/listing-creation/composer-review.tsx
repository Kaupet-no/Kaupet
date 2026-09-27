import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ComposerReviewClassification,
  ComposerReviewStatus,
} from "@/features/listing-creation/field-groups/types";

const statusSections: {
  classifications: ComposerReviewClassification[];
  heading: string;
  actionLabel: string;
}[] = [
  {
    classifications: ["requiredToPublish"],
    heading: "Dette må fylles ut",
    actionLabel: "Fiks dette",
  },
  {
    classifications: ["recommendedForTrust", "optionalEnhancement"],
    heading: "Gjør annonsen bedre",
    actionLabel: "Endre",
  },
];

/**
 * Compact annonsestyrke-indikator (V3): erstatter den gamle "Publiseringsstatus"-
 * boksen og "Publiseringsklar"-overskriften med ett kompakt element — en prikk +
 * tekst, med lenker rett til feltene når noe blokkerer. To nivåer, ikke tre:
 * blokkerende (requiredToPublish) og valgfritt bedre (alt annet). Vises på
 * én linje (`inline`) i stegraden gjennom hele flyten på desktop, og øverst på
 * Se over (se ReviewPublishGroup / ny-annonse.tsx sin `strength`).
 */
export function ListingStrengthIndicator({
  required,
  improvements,
  inline,
}: {
  required: ComposerReviewStatus[];
  improvements: ComposerReviewStatus[];
  inline?: boolean;
}) {
  const ready = required.length === 0;
  const invitation = improvements[0];
  return (
    <section
      aria-labelledby="listing-strength-title"
      className={inline ? "flex flex-wrap items-center gap-x-4 gap-y-1" : "space-y-2"}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn("size-2.5 shrink-0 rounded-full", ready ? "bg-primary" : "bg-destructive")}
        />
        <p
          id="listing-strength-title"
          role="status"
          aria-live="polite"
          className="text-sm font-semibold"
        >
          {ready
            ? "Klar til publisering"
            : `${required.length} ${required.length === 1 ? "opplysning" : "opplysninger"} må fylles ut`}
        </p>
      </div>
      {!ready ? (
        <ul className={inline ? "flex flex-wrap gap-x-3" : "space-y-1 pl-[1.125rem]"}>
          {required.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={item.onAction}
                className="native-touch-target text-left text-sm text-destructive underline decoration-dotted underline-offset-4 hover:decoration-solid"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        invitation && (
          <button
            type="button"
            onClick={invitation.onAction}
            className={cn(
              "native-touch-target text-left text-sm text-brand-text underline decoration-dotted underline-offset-4 hover:decoration-solid",
              !inline && "block pl-[1.125rem]",
            )}
          >
            {invitation.key === "photos"
              ? "Legg til bilder, så finner flere den"
              : invitation.label}
          </button>
        )
      )}
    </section>
  );
}

export function ComposerReviewStatuses({ items }: { items: ComposerReviewStatus[] }) {
  return (
    <div className="space-y-3">
      {statusSections.map((section) => {
        const sectionItems = items.filter((item) =>
          section.classifications.includes(item.classification),
        );
        if (sectionItems.length === 0) return null;
        return (
          <section
            key={section.classifications.join("-")}
            aria-labelledby={`composer-status-${section.classifications.join("-")}`}
            role={section.classifications.includes("requiredToPublish") ? "alert" : undefined}
            className={
              section.classifications.includes("requiredToPublish")
                ? "rounded-lg border border-destructive/50 px-4 py-3 text-destructive"
                : "rounded-lg border border-border bg-card px-4 py-3"
            }
          >
            <h4
              id={`composer-status-${section.classifications.join("-")}`}
              className="text-sm font-semibold"
            >
              {section.heading} ({sectionItems.length})
            </h4>
            <ul className="mt-2 divide-y divide-current/10">
              {sectionItems.map((item) => (
                <li
                  key={item.key}
                  className="flex min-h-12 items-center gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0 flex-1 text-sm">{item.label}</span>
                  {item.onAction && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="native-touch-target shrink-0"
                      onClick={item.onAction}
                    >
                      {item.actionLabel ?? section.actionLabel}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
