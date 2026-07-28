import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { confirmBuyer } from "@/lib/sales.functions";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Contact = {
  conversationId: string;
  buyerId: string;
  displayName: string;
  avatarUrl: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
};

export function MarkSoldDialog({ open, onOpenChange, listingId }: Props) {
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const confirmBuyerFn = useServerFn(confirmBuyer);

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["listing-contacts", listingId],
    enabled: open,
    queryFn: async (): Promise<Contact[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `id, buyer_id, last_message_at, buyer:profiles!conversations_buyer_id_fkey(display_name, avatar_url)`,
        )
        .eq("listing_id", listingId)
        .order("last_message_at", { ascending: false });
      if (error) {
        const { data: convs, error: e2 } = await supabase
          .from("conversations")
          .select("id, buyer_id, last_message_at")
          .eq("listing_id", listingId)
          .order("last_message_at", { ascending: false });
        if (e2) throw e2;
        const buyerIds = Array.from(new Set((convs ?? []).map((c) => c.buyer_id)));
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", buyerIds);
        const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
        return (convs ?? []).map((c) => ({
          conversationId: c.id,
          buyerId: c.buyer_id,
          displayName: pmap.get(c.buyer_id)?.display_name ?? "Ukjent bruker",
          avatarUrl: pmap.get(c.buyer_id)?.avatar_url ?? null,
        }));
      }
      type Row = {
        id: string;
        buyer_id: string;
        buyer:
          | { display_name: string; avatar_url: string | null }
          | { display_name: string; avatar_url: string | null }[]
          | null;
      };
      return ((data ?? []) as unknown as Row[]).map((c) => {
        const buyer = Array.isArray(c.buyer) ? c.buyer[0] : c.buyer;
        return {
          conversationId: c.id,
          buyerId: c.buyer_id,
          displayName: buyer?.display_name ?? "Ukjent bruker",
          avatarUrl: buyer?.avatar_url ?? null,
        };
      });
    },
  });

  const confirmMut = useMutation({
    mutationFn: () => confirmBuyerFn({ data: { conversationId: selectedConversationId! } }),
    onSuccess: () => {
      showSuccessToast("Kjøper bekreftet");
      queryClient.invalidateQueries({ queryKey: ["listing"] });
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      onOpenChange(false);
      setSelectedConversationId(null);
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke bekrefte kjøper")),
  });

  const markSoldWithoutBuyerMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("listings")
        .update({ status: "sold" })
        .eq("id", listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccessToast("Annonsen er merket som solgt");
      queryClient.invalidateQueries({ queryKey: ["listing"] });
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      onOpenChange(false);
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke oppdatere status")),
  });

  const isPending = confirmMut.isPending || markSoldWithoutBuyerMut.isPending;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Er du sikker på at du vil sette annonsen som solgt?</AlertDialogTitle>
          <AlertDialogDescription>
            {contacts && contacts.length > 0
              ? "Velg hvem som kjøpte annonsen."
              : "Ingen har tatt kontakt om denne annonsen ennå."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && contacts && contacts.length > 0 && (
          <RadioGroup
            value={selectedConversationId ?? undefined}
            onValueChange={setSelectedConversationId}
            className="max-h-64 space-y-1 overflow-y-auto py-1"
          >
            {contacts.map((c) => (
              <Label
                key={c.conversationId}
                htmlFor={`contact-${c.conversationId}`}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-2 py-2 hover:bg-muted has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem value={c.conversationId} id={`contact-${c.conversationId}`} />
                <Avatar className="size-8">
                  <AvatarImage src={c.avatarUrl ?? undefined} />
                  <AvatarFallback>{c.displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-sm">{c.displayName}</span>
              </Label>
            ))}
          </RadioGroup>
        )}

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <div className="flex w-full justify-end gap-2">
            <AlertDialogCancel disabled={isPending}>Avbryt</AlertDialogCancel>
            {contacts && contacts.length > 0 ? (
              <Button
                disabled={isPending || !selectedConversationId}
                onClick={() => confirmMut.mutate()}
              >
                {confirmMut.isPending && <Loader2 className="size-4 animate-spin" />}
                Bekreft kjøper
              </Button>
            ) : (
              !isLoading && (
                <Button disabled={isPending} onClick={() => markSoldWithoutBuyerMut.mutate()}>
                  {markSoldWithoutBuyerMut.isPending && <Loader2 className="size-4 animate-spin" />}
                  Merk som solgt
                </Button>
              )
            )}
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
