import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatErrorMessage } from "@/lib/errors";

export function DefaultSearchExamplesCard({ readOnly = false }: { readOnly?: boolean }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "site-settings", "default-search-examples"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("default_search_examples")
        .eq("id", true)
        .single();
      if (error) throw error;
      return data.default_search_examples;
    },
  });

  const value = draft ?? (data ?? []).join("\n");

  const save = useMutation({
    mutationFn: async () => {
      const words = value
        .split("\n")
        .map((w) => w.trim())
        .filter(Boolean);
      const { error } = await supabase
        .from("site_settings")
        .update({ default_search_examples: words })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccessToast("Standard søkeord lagret");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin", "site-settings", "default-search-examples"] });
      qc.invalidateQueries({ queryKey: ["site-settings", "default-search-examples"] });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre søkeordene")),
  });

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <Label htmlFor="default-search-examples">Standard søkeord (forsiden)</Label>
        <p className="text-xs text-muted-foreground">
          Ett ord/uttrykk per linje. Rulleres i søkefeltets typewriter-animasjon på forsiden før en
          kategori er valgt.
        </p>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : isError ? (
          <p className="text-sm text-destructive">
            {formatErrorMessage(error, "Kunne ikke laste søkeordene")}
          </p>
        ) : (
          <>
            <Textarea
              id="default-search-examples"
              value={value}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              disabled={readOnly}
            />
            {!readOnly && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={draft === null || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Lagre"}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
