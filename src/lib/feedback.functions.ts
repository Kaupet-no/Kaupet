import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { hashRequestIp, sha256Hex } from "@/lib/request-ip.server";

const feedbackSchema = z.object({
  type: z.enum(["ris", "ros"]),
  message: z.string().trim().min(1, "Skriv en melding").max(2000, "Maks 2000 tegn"),
  pageUrl: z.string().trim().max(2000).optional(),
});

async function rateLimitedInsert(args: {
  userId: string | null;
  type: string;
  message: string;
  pageUrl?: string | null;
  categoryName?: string | null;
  categoryDescription?: string | null;
  rateLimitedMessage: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const keyHash = args.userId ? await sha256Hex(`user:${args.userId}`) : await hashRequestIp();
  const { error } = await supabaseAdmin.rpc("submit_feedback_rate_limited", {
    _key_hash: keyHash,
    _type: args.type,
    _message: args.message,
    _user_id: args.userId,
    _page_url: args.pageUrl ?? null,
    _category_name: args.categoryName ?? null,
    _category_description: args.categoryDescription ?? null,
  });
  if (error) {
    if (error.message.includes("rate_limited")) throw new Error(args.rateLimitedMessage);
    throw error;
  }
}

/** Best-effort user attribution from the (optional) Authorization header. */
async function attributedUserId(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  const { data: claims } = await supabaseAdmin.auth.getClaims(token);
  return (claims?.claims?.sub as string | undefined) ?? null;
}

/** Submits a "Ris og Ros" feedback message. Works without login — when a
 * valid Supabase bearer token accompanies the request the feedback is
 * attributed to that user, otherwise it's stored anonymously. Rate-limited
 * in the database (see submit_feedback_rate_limited) rather than in memory,
 * since a Worker isolate's memory doesn't survive between requests. */
export const submitFeedback = createServerFn({ method: "POST" })
  .validator((input: unknown) => feedbackSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await attributedUserId();
    await rateLimitedInsert({
      userId,
      type: data.type,
      message: data.message,
      pageUrl: data.pageUrl,
      rateLimitedMessage: "Du har sendt mange tilbakemeldinger på kort tid. Prøv igjen senere.",
    });
  });

const categorySuggestionSchema = z.object({
  categoryName: z.string().trim().min(1, "Skriv inn en kategori").max(200, "Maks 200 tegn"),
  description: z.string().trim().max(2000, "Maks 2000 tegn").optional(),
  pageUrl: z.string().trim().max(2000).optional(),
});

/** Submits a category suggestion without exposing feedback rows to clients. */
export const submitCategorySuggestion = createServerFn({ method: "POST" })
  .validator((input: unknown) => categorySuggestionSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await attributedUserId();
    await rateLimitedInsert({
      userId,
      type: "kategori",
      message: data.categoryName,
      pageUrl: data.pageUrl,
      categoryName: data.categoryName,
      categoryDescription: data.description || null,
      rateLimitedMessage: "Du har sendt mange forslag på kort tid. Prøv igjen senere.",
    });
  });
