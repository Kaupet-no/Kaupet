import { ClientError, toClientError } from "@/lib/to-client-error";
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
  .validator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ListingSale | null> => {
    const { supabase } = context;
    const { data: sale, error } = await supabase
      .from("listing_sales")
      .select("listing_id, seller_id, buyer_id, conversation_id, confirmed_at")
      .eq("listing_id", data.listingId)
      .maybeSingle();
    if (error) {
      throw await toClientError("database", error);
    }
    return sale ?? null;
  });

export const confirmBuyer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("id, listing_id, seller_id, buyer_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr) {
      throw await toClientError("database", convErr);
    }
    if (!conv) throw new ClientError("Samtalen finnes ikke", 404);
    if (conv.seller_id !== userId) {
      throw new ClientError("Bare selger kan markere en kjøper", 403);
    }

    if (!conv.listing_id)
      throw new ClientError("Denne samtalen er ikke knyttet til en annonse til salgs", 400);
    const { error: insErr } = await supabase.from("listing_sales").insert({
      listing_id: conv.listing_id,
      seller_id: conv.seller_id,
      buyer_id: conv.buyer_id,
      conversation_id: conv.id,
    });
    if (insErr) {
      if (insErr.code === "23505") {
        throw new ClientError("Det finnes allerede en bekreftet kjøper for denne annonsen", 409);
      }
      throw await toClientError("database", insErr);
    }
    return { ok: true };
  });

export const unconfirmBuyer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
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
    if (!sale) throw new ClientError("Salget finnes ikke", 404);
    if (sale.seller_id !== userId) {
      throw new ClientError("Bare selger kan angre salget", 403);
    }

    const { count } = await supabase
      .from("user_reviews")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", data.listingId);
    if ((count ?? 0) > 0) {
      throw new ClientError("Salget kan ikke angres etter at vurderinger er gitt", 409);
    }

    const { error } = await supabase
      .from("listing_sales")
      .delete()
      .eq("listing_id", data.listingId);
    if (error) {
      if (
        error.code === "23514" &&
        error.message === "Salget kan ikke angres etter at vurderinger er gitt"
      ) {
        throw new ClientError("Salget kan ikke angres etter at vurderinger er gitt", 409);
      }
      throw await toClientError("database", error);
    }
    return { ok: true };
  });
