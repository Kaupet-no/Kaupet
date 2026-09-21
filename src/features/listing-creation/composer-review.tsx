import { Button } from "@/components/ui/button";
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
