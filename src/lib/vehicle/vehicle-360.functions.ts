import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MIN_360_FRAMES = 16;
export const MAX_360_FRAMES = 36;
export const TARGET_360_FRAMES = 24;

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) =>
    c === "+" ? "-" : c === "/" ? "_" : "",
  );
}

// Én stabil QR-kode per annonseutkast — ikke en tidsbegrenset engangskode.
// Idempotent: kalles denne flere ganger for samme utkast (f.eks. ved
// sidelast på nytt) gjenbrukes samme token i stedet for å opprette en ny
// rad, slik at koden brukeren evt. allerede har delt/lagret fortsatt virker.
export const createVehicle360CaptureSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id")
      .eq("id", data.listingId)
      .eq("seller_id", userId)
      .maybeSingle();
    if (listingError) throw listingError;
    if (!listing) throw new Error("Fant ikke annonseutkastet");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("listing_360_capture_sessions")
      .select("token")
      .eq("listing_id", data.listingId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return { token: existing.token };

    const token = randomToken();
    const { error } = await supabaseAdmin.from("listing_360_capture_sessions").insert({
      listing_id: data.listingId,
      token,
      created_by: userId,
    });
    if (error) throw error;

    return { token };
  });

export const getVehicle360CaptureSession = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ token: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: session, error } = await supabaseAdmin
      .from("listing_360_capture_sessions")
      .select("listing_id, listings(title)")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw error;
    if (!session) throw new Error("Fant ikke QR-koden. Be selger vise en ny på annonsen.");

    const { data: existingFrames, error: framesError } = await supabaseAdmin
      .from("listing_360_frames")
      .select("frame_order")
      .eq("listing_id", session.listing_id)
      .order("frame_order", { ascending: false })
      .limit(1);
    if (framesError) throw framesError;

    const listing = Array.isArray(session.listings) ? session.listings[0] : session.listings;

    return {
      listingTitle: (listing?.title as string | undefined) ?? "annonsen din",
      nextFrameOrder: (existingFrames?.[0]?.frame_order ?? -1) + 1,
    };
  });

const ALLOWED_360_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

function extFrom360Mime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  return "webp";
}

// Mobilklienten som scanner QR-koden har ingen innlogget Supabase-sesjon, så
// den kan ikke laste opp direkte til Storage (RLS krever eierskap). Bildet
// sendes derfor som base64 til denne server-funksjonen, som validerer token
// og laster opp med service-role — tokenet er eneste autorisasjon.
export const uploadVehicle360Frame = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(1),
        frameOrder: z
          .number()
          .int()
          .min(0)
          .max(MAX_360_FRAMES - 1),
        contentType: z.enum(ALLOWED_360_MIME),
        base64Data: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("listing_360_capture_sessions")
      .select("listing_id")
      .eq("token", data.token)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) throw new Error("Fant ikke QR-koden. Be selger vise en ny på annonsen.");

    const bytes = Buffer.from(data.base64Data, "base64");
    if (bytes.byteLength > 2 * 1024 * 1024) {
      throw new Error("Bildet er for stort");
    }
    const ext = extFrom360Mime(data.contentType);
    const path = `${session.listing_id}/${data.frameOrder}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("listing-360-frames")
      .upload(path, bytes, {
        contentType: data.contentType,
        cacheControl: "31536000",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const { error } = await supabaseAdmin.from("listing_360_frames").upsert(
      {
        listing_id: session.listing_id,
        storage_path: path,
        frame_order: data.frameOrder,
      },
      { onConflict: "listing_id,frame_order" },
    );
    if (error) throw error;

    return { ok: true as const };
  });

export const completeVehicle360CaptureSession = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ token: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("listing_360_capture_sessions")
      .update({ used_at: new Date().toISOString() })
      .eq("token", data.token);
    if (error) throw error;
    return { ok: true as const };
  });

export const getVehicle360FrameCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id")
      .eq("id", data.listingId)
      .eq("seller_id", userId)
      .maybeSingle();
    if (listingError) throw listingError;
    if (!listing) throw new Error("Fant ikke annonseutkastet");

    const { count, error } = await supabaseAdmin
      .from("listing_360_frames")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", data.listingId);
    if (error) throw error;
    return { count: count ?? 0 };
  });

export const getVehicle360Frames = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id")
      .eq("id", data.listingId)
      .eq("seller_id", userId)
      .maybeSingle();
    if (listingError) throw listingError;
    if (!listing) throw new Error("Fant ikke annonseutkastet");

    const { data: frames, error } = await supabaseAdmin
      .from("listing_360_frames")
      .select("storage_path, frame_order")
      .eq("listing_id", data.listingId)
      .order("frame_order", { ascending: true });
    if (error) throw error;
    return frames ?? [];
  });

export const deleteVehicle360Frames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id")
      .eq("id", data.listingId)
      .eq("seller_id", userId)
      .maybeSingle();
    if (listingError) throw listingError;
    if (!listing) throw new Error("Fant ikke annonseutkastet");

    const { data: frames, error: framesError } = await supabaseAdmin
      .from("listing_360_frames")
      .select("storage_path")
      .eq("listing_id", data.listingId);
    if (framesError) throw framesError;
    if (frames && frames.length > 0) {
      await supabaseAdmin.storage
        .from("listing-360-frames")
        .remove(frames.map((f) => f.storage_path));
    }
    const { error } = await supabaseAdmin
      .from("listing_360_frames")
      .delete()
      .eq("listing_id", data.listingId);
    if (error) throw error;
    return { ok: true as const };
  });
