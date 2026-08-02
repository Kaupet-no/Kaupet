import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatErrorMessage } from "@/lib/errors";
import { showErrorToast } from "@/lib/toast";
import { slugify } from "./shared";

type Suggestion = { value: string; listing_count: number };

/**
 * "Foreslå fra annonser" — Fase 2.6 (alternativ B): reads the actual
 * distinct values already stored in `attributes->>key` across this
 * category's listings (via the suggest_attribute_values RPC) instead of
 * making an admin hand-write a brand/value list for each of the ~50
 * categories that have a free-text attribute like Merke. The admin still
 * picks which suggestions to keep — this proposes, it doesn't auto-commit.
 */
export function SuggestValuesButton({
  categoryId,
  filterKey,
  onApply,
}: {
  categoryId: string;
  filterKey: string;
  onApply: (options: { value: string; label_nb: string }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isPending, mutate, reset } = useMutation({
    mutationFn: async (): Promise<Suggestion[]> => {
      const { data, error } = await supabase.rpc("suggest_attribute_values", {
        p_category_id: categoryId,
        p_key: filterKey,
        p_limit: 25,
      });
      if (error) throw error;
      return data ?? [];
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke hente forslag")),
  });

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !data) mutate();
        if (!o) {
          reset();
          setSelected(new Set());
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={!filterKey.trim()}>
          <Sparkles className="size-4" /> Foreslå fra annonser
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3">
        <p className="text-sm text-muted-foreground">
          Verdier funnet på faktiske annonser i denne kategorien (nyeste bruk øverst). Velg de du
          vil gjøre til faste filtervalg.
        </p>
        {isPending ? (
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ingen annonser med denne attributten ennå.
          </p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {data.map((s) => (
              <li key={s.value}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                  <Checkbox
                    checked={selected.has(s.value)}
                    onCheckedChange={(c) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (c === true) next.add(s.value);
                        else next.delete(s.value);
                        return next;
                      })
                    }
                  />
                  <span className="flex-1">{s.value}</span>
                  <span className="text-xs text-muted-foreground">{s.listing_count}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={selected.size === 0}
          onClick={() => {
            const options = (data ?? [])
              .filter((s) => selected.has(s.value))
              .map((s) => ({ value: slugify(s.value), label_nb: s.value }));
            onApply(options);
            setOpen(false);
            setSelected(new Set());
            reset();
          }}
        >
          Legg til {selected.size > 0 ? `(${selected.size})` : ""}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
