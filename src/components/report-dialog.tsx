import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const LISTING_REPORT_REASONS = [
  "Upassende innhold",
  "Misvisende beskrivelse",
  "Feil kategori",
  "Mistenkelig aktivitet / mulig svindel",
  "Spam / duplikat annonse",
  "Ulovlig vare eller tjeneste",
  "Annet",
] as const;

export const USER_REPORT_REASONS = [
  "Trakassering eller upassende oppførsel",
  "Mistenkelig aktivitet / mulig svindel",
  "Utgir seg for å være noen andre",
  "Svarer ikke / uteblir fra avtale",
  "Spam eller reklame",
  "Ulovlig aktivitet",
  "Annet",
] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  reasons: readonly string[];
  reason: string;
  onReasonChange: (v: string) => void;
  comment: string;
  onCommentChange: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
};

export function ReportDialog({
  open,
  onOpenChange,
  title,
  description,
  reasons,
  reason,
  onReasonChange,
  comment,
  onCommentChange,
  onSubmit,
  pending,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="report-reason">Grunn</Label>
            <Select value={reason} onValueChange={onReasonChange}>
              <SelectTrigger id="report-reason">
                <SelectValue placeholder="Velg en grunn…" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-comment">Kommentar (valgfri)</Label>
            <Textarea
              id="report-comment"
              placeholder="Legg til mer informasjon om hva du reagerer på…"
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              maxLength={1000}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Avbryt
          </Button>
          <Button onClick={onSubmit} disabled={!reason || pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Send inn rapport
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
