import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { Textarea } from "@/components/ui/textarea";
import { formatErrorMessage } from "@/lib/errors";
import { submitCategorySuggestion } from "@/lib/feedback.functions";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

export function CategorySuggestionDialog() {
  const submitFn = useServerFn(submitCategorySuggestion);
  const [open, setOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const close = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setCategoryName("");
      setDescription("");
      setError(null);
    }
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      await submitFn({
        data: {
          categoryName: categoryName.trim(),
          description: description.trim() || undefined,
          pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
        },
      });
      showSuccessToast("Kategoriforslaget er sendt. Takk!");
      close(false);
    } catch (e) {
      const message = formatErrorMessage(e, "Kunne ikke sende kategoriforslaget. Prøv igjen.");
      setError(message);
      showErrorToast(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <ResponsiveOverlay open={open} onOpenChange={close}>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0 text-sm text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        Savner du en kategori?
      </Button>
      <ResponsiveOverlayContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Savner du en kategori?</DialogTitle>
          <DialogDescription>Foreslå en kategori du mener Kaupet bør ha.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={send}>
          <div className="space-y-2">
            <Label htmlFor="category-suggestion-name">Ny kategori</Label>
            <Input
              id="category-suggestion-name"
              value={categoryName}
              maxLength={200}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="For eksempel: Brettspill"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-suggestion-description">
              Hvorfor eller hva bør kategorien inneholde?
            </Label>
            <Textarea
              id="category-suggestion-description"
              value={description}
              maxLength={2000}
              rows={5}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Valgfritt"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={sending || !categoryName.trim()}>
              {sending ? "Sender…" : "Send forslag"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
