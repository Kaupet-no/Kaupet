import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logServerError } from "@/lib/server-error-log";

export type ListingSale = {
  listing_id: string;
  seller_id: string;
  buyer_id: string;
  conversation_id: string;
  confirmed_at: string;
};

export const getSaleForListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ListingSale | null> => {
    const { supabase } = context;
    const { data: sale, error } = await supabase
      .from("listing_sales")
      .select("listing_id, seller_id, buyer_id, conversation_id, confirmed_at")
      .eq("listing_id", data.listingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return sale ?? null;
  });

export const confirmBuyer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("id, listing_id, seller_id, buyer_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) throw new Error("Samtalen finnes ikke");
    if (conv.seller_id !== userId) {
      throw new Error("Bare selger kan markere en kjøper");
    }

    if (!conv.listing_id)
      throw new Error("Denne samtalen er ikke knyttet til en annonse til salgs");
    const { error: insErr } = await supabase.from("listing_sales").insert({
      listing_id: conv.listing_id,
      seller_id: conv.seller_id,
      buyer_id: conv.buyer_id,
      conversation_id: conv.id,
    });
    if (insErr) {
      if (insErr.code === "23505") {
        throw new Error("Det finnes allerede en bekreftet kjøper for denne annonsen");
      }
      throw new Error(insErr.message);
    }
    return { ok: true };
  });

export const unconfirmBuyer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sale, error: saleErr } = await supabase
      .from("listing_sales")
      .select("listing_id, seller_id")
      .eq("listing_id", data.listingId)
      .maybeSingle();
    if (saleErr) {
      await logServerError("unconfirmBuyer", saleErr, { listingId: data.listingId, userId });
      throw saleErr;
    }
    if (!sale) throw new Error("Salget finnes ikke");
    if (sale.seller_id !== userId) {
      throw new Error("Bare selger kan angre salget");
    }

    const { count } = await supabase
      .from("user_reviews")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", data.listingId);
    if ((count ?? 0) > 0) {
      throw new Error("Salget kan ikke angres etter at vurderinger er gitt");
    }

    const { error } = await supabase
      .from("listing_sales")
      .delete()
      .eq("listing_id", data.listingId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
