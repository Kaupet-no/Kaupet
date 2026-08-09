import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/** Naive in-memory throttle per worker instance: max N submissions per key
 * (user id or IP) per hour. Good enough as abuse damping for a feedback box;
 * the table itself is only writable through this fn (no RLS insert policy). */
const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;
const recentByKey = new Map<string, number[]>();

function throttle(key: string): boolean {
  const now = Date.now();
  const arr = (recentByKey.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= RATE_LIMIT) return false;
  arr.push(now);
  recentByKey.set(key, arr);
  return true;
}

const feedbackSchema = z.object({
  type: z.enum(["ris", "ros"]),
  message: z.string().trim().min(1, "Skriv en melding").max(2000, "Maks 2000 tegn"),
  pageUrl: z.string().trim().max(2000).optional(),
});

/** Submits a "Ris og Ros" feedback message. Works without login — when a
 * valid Supabase bearer token accompanies the request the feedback is
 * attributed to that user, otherwise it's stored anonymously. */
export const submitFeedback = createServerFn({ method: "POST" })
  .validator((input: unknown) => feedbackSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Best-effort user attribution from the (optional) Authorization header.
    let userId: string | null = null;
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length);
      const { data: claims } = await supabaseAdmin.auth.getClaims(token);
      userId = (claims?.claims?.sub as string | undefined) ?? null;
    }

    const ip =
      request?.headers?.get("cf-connecting-ip") ??
      request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    if (!throttle(userId ?? `ip:${ip}`)) {
      throw new Error("Du har sendt mange tilbakemeldinger på kort tid. Prøv igjen senere.");
    }

    const { error } = await supabaseAdmin.from("feedback").insert({
      type: data.type,
      message: data.message,
      user_id: userId,
      page_url: data.pageUrl ?? null,
    });
    if (error) throw error;
  });
