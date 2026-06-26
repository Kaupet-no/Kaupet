import * as React from "react";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/star-rating";
import { formatErrorMessage } from "@/lib/errors";

export function ReviewForm({
  myReview,
  otherName,
  onSubmit,
}: {
  myReview: { rating: number; comment: string | null } | null;
  otherName: string;
  onSubmit: (rating: number, comment: string) => Promise<void>;
}) {
  const [rating, setRating] = useState(myReview?.rating ?? 0);
  const [comment, setComment] = useState(myReview?.comment ?? "");
  const [submitting, setSubmitting] = useState(false);

  if (myReview) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-medium text-muted-foreground">Din vurdering</p>
        <div className="mt-1 flex items-center gap-2">
          <StarRating value={myReview.rating} readOnly size={18} />
          <span className="text-sm font-medium">{myReview.rating} / 5</span>
        </div>
        {myReview.comment && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{myReview.comment}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Vurderinger er endelige og kan ikke endres etter publisering.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      showErrorToast("Velg minst én stjerne");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(rating, comment.trim());
    } catch (err) {
      showErrorToast(formatErrorMessage(err, "Kunne ikke sende vurderingen"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div>
        <p className="text-sm font-medium">Gi {otherName} en vurdering</p>
        <p className="text-xs text-muted-foreground">
          1–5 stjerner og en kort kommentar (valgfri). Vurderingen er endelig.
        </p>
      </div>
      <StarRating value={rating} onChange={setRating} size={28} />
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Kort kommentar (valgfri)"
        rows={3}
        maxLength={500}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={submitting || rating < 1} className="gap-2">
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Publiser vurdering
        </Button>
      </div>
    </form>
  );
}
