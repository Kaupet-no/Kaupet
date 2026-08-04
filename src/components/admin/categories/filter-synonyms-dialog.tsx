import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatErrorMessage } from "@/lib/errors";
import type { CategoryFilter } from "@/lib/category-filters";

type SynonymRow = {
  id: string;
  option_value: string | null;
  phrase: string;
  is_generated: boolean;
  is_ambiguous: boolean;
};

/**
 * Manages the `filter_synonyms` dictionary for one category filter — the
 * phrases a buyer can type in the search box (e.g. "ryggekamera") that get
 * recognized as this filter's value instead of only matched as plain text
 * against a listing's title/description. See
 * use-search-synonym-matches.ts for how these are consumed at search time.
 */
export function FilterSynonymsDialog({
  filter,
  open,
  onOpenChange,
}: {
  filter: CategoryFilter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [newPhrase, setNewPhrase] = useState("");
  const [newOptionValue, setNewOptionValue] = useState(filter.options?.[0]?.value ?? "");
  const [newIsAmbiguous, setNewIsAmbiguous] = useState(false);

  const queryKey = ["admin", "filter-synonyms", filter.id];

  const { data: rows, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<SynonymRow[]> => {
      const { data, error } = await supabase
        .from("filter_synonyms")
        .select("id, option_value, phrase, is_generated, is_ambiguous")
        .eq("category_filter_id", filter.id)
        .order("phrase");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const add = useMutation({
    mutationFn: async () => {
      const phrase = newPhrase.trim().toLowerCase();
      if (!phrase) throw new Error("Frase er påkrevd");
      const option_value = filter.type === "boolean" ? null : newOptionValue || null;
      const { error } = await supabase.from("filter_synonyms").insert({
        category_filter_id: filter.id,
        option_value,
        phrase,
        is_generated: false,
        is_ambiguous: newIsAmbiguous,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewPhrase("");
      setNewIsAmbiguous(false);
      invalidate();
      showSuccessToast("Synonym lagt til");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke legge til synonym")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("filter_synonyms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke slette synonym")),
  });

  const optionLabel = (value: string | null) =>
    value === null
      ? filter.label_nb
      : (filter.options?.find((o) => o.value === value)?.label_nb ?? value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Synonymer for «{filter.label_nb}»</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Fraser en bruker kan skrive i søkefeltet som skal tolkes som dette filteret — f.eks.
          «ryggekamera» for et førerstøtte-utstyr, i stedet for å bare søkes som fritekst.
        </p>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (rows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen synonymer ennå.</p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {(rows ?? []).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-accent/40"
              >
                <span>
                  «{r.phrase}» → {optionLabel(r.option_value)}
                  {r.is_generated && (
                    <span className="ml-1 text-xs text-muted-foreground">(auto)</span>
                  )}
                  {r.is_ambiguous && (
                    <span className="ml-1 text-xs text-muted-foreground">(tvetydig)</span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove.mutate(r.id)}
                  aria-label="Slett synonym"
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
          className="flex items-end gap-2"
        >
          <div className="flex-1 space-y-1">
            <Label htmlFor="syn-phrase">Ny frase</Label>
            <Input
              id="syn-phrase"
              value={newPhrase}
              onChange={(e) => setNewPhrase(e.target.value)}
              placeholder="f.eks. revers-kamera"
            />
          </div>
          {filter.type !== "boolean" && (
            <div className="w-44 space-y-1">
              <Label>Verdi</Label>
              <Select value={newOptionValue} onValueChange={setNewOptionValue}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(filter.options ?? []).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label_nb}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-1.5 pb-2">
            <Checkbox
              id="syn-ambiguous"
              checked={newIsAmbiguous}
              onCheckedChange={(v) => setNewIsAmbiguous(v === true)}
            />
            <Label htmlFor="syn-ambiguous" className="text-xs font-normal">
              Tvetydig (krever annet Bil-signal)
            </Label>
          </div>
          <Button type="submit" disabled={add.isPending}>
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : "Legg til"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
