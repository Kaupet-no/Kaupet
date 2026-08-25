import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  ComposerReviewClassification,
  ComposerReviewStatus,
} from "@/features/listing-creation/field-groups/types";

export type ComposerReviewItem = {
  key: string;
  label: string;
  value: React.ReactNode;
  onEdit: () => void;
};

const statusSections: {
  classification: ComposerReviewClassification;
  heading: string;
  actionLabel: string;
}[] = [
  {
    classification: "requiredToPublish",
    heading: "Må fylles ut",
    actionLabel: "Fiks dette",
  },
  {
    classification: "recommendedForTrust",
    heading: "Anbefales",
    actionLabel: "Endre",
  },
  {
    classification: "optionalEnhancement",
    heading: "Valgfritt",
    actionLabel: "Endre",
  },
];

export function ComposerReviewStatuses({ items }: { items: ComposerReviewStatus[] }) {
  return (
    <div className="space-y-3">
      {statusSections.map((section) => {
        const sectionItems = items.filter((item) => item.classification === section.classification);
        if (sectionItems.length === 0) return null;
        return (
          <section
            key={section.classification}
            aria-labelledby={`composer-status-${section.classification}`}
            role={section.classification === "requiredToPublish" ? "alert" : undefined}
            className={
              section.classification === "requiredToPublish"
                ? "rounded-lg border border-destructive/50 px-4 py-3 text-destructive"
                : "rounded-lg border border-border bg-card px-4 py-3"
            }
          >
            <h4 id={`composer-status-${section.classification}`} className="text-sm font-semibold">
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

export function ComposerReview({ items }: { items: ComposerReviewItem[] }) {
  return (
    <section aria-labelledby="composer-review-title" className="space-y-3">
      <div>
        <h3 id="composer-review-title" className="text-lg font-semibold">
          Se over
        </h3>
        <p className="text-sm text-muted-foreground">Kontroller opplysningene før du publiserer.</p>
      </div>
      <dl className="divide-y overflow-hidden rounded-xl border border-border bg-card">
        {items.map((item) => (
          <div key={item.key} className="flex min-h-16 items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <dt className="text-sm font-medium">{item.label}</dt>
              <dd className="mt-0.5 text-sm text-muted-foreground">
                {item.value || "Ikke oppgitt"}
              </dd>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="native-touch-target"
              onClick={item.onEdit}
            >
              <Pencil className="size-4" aria-hidden /> Endre
            </Button>
          </div>
        ))}
      </dl>
    </section>
  );
}
