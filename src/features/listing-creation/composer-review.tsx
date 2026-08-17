import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";

export type ComposerReviewItem = {
  key: string;
  label: string;
  value: React.ReactNode;
  onEdit: () => void;
};

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
