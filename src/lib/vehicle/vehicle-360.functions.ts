import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MIN_360_FRAMES = 16;
export const MAX_360_FRAMES = 36;
export const TARGET_360_FRAMES = 24;
export const VEHICLE_360_SESSION_TTL_MS = 30 * 60 * 1000;
export const MAX_360_FRAME_BYTES = 2 * 1024 * 1024;
export const MAX_360_BASE64_CHARS = Math.ceil(MAX_360_FRAME_BYTES / 3) * 4;

const TOKEN_SCHEMA = z.string().min(32).max(128);

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
      .select("token, expires_at, used_at")
      .eq("listing_id", data.listingId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (
      existing &&
      !existing.used_at &&
      existing.expires_at &&
      new Date(existing.expires_at).getTime() > Date.now()
    ) {
      return { token: existing.token, expiresAt: existing.expires_at };
    }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + VEHICLE_360_SESSION_TTL_MS).toISOString();
    const { error } = existing
      ? await supabaseAdmin
          .from("listing_360_capture_sessions")
          .update({
            token,
            expires_at: expiresAt,
            used_at: null,
            created_at: new Date().toISOString(),
          })
          .eq("listing_id", data.listingId)
          .eq("created_by", userId)
      : await supabaseAdmin.from("listing_360_capture_sessions").insert({
          listing_id: data.listingId,
          token,
          created_by: userId,
          expires_at: expiresAt,
        });
    if (error) throw error;

    return { token, expiresAt };
  });

export const getVehicle360CaptureSession = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ token: TOKEN_SCHEMA }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: session, error } = await supabaseAdmin
      .from("listing_360_capture_sessions")
      .select("listing_id, listings(title)")
      .eq("token", data.token)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
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

export function hasValid360MagicBytes(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, i) => bytes[i] === value);
  }
  if (mime === "image/webp") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
    );
  }
  return false;
}

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
        token: TOKEN_SCHEMA,
        frameOrder: z
          .number()
          .int()
          .min(0)
          .max(MAX_360_FRAMES - 1),
        contentType: z.enum(ALLOWED_360_MIME),
        base64Data: z
          .string()
          .min(4)
          .max(MAX_360_BASE64_CHARS)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/)
          .refine((value) => value.length % 4 === 0, "Ugyldig base64-data"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashRequestIp } = await import("@/lib/request-ip.server");

    const { data: listingId, error: quotaError } = await supabaseAdmin.rpc(
      "consume_vehicle_360_upload_slot",
      { _token: data.token, _ip_hash: await hashRequestIp() },
    );
    if (quotaError) throw quotaError;
    if (!listingId) {
      throw new Error("Opptaksøkten er utløpt eller har for mange opplastingsforsøk.");
    }

    const bytes = Buffer.from(data.base64Data, "base64");
    if (bytes.byteLength > MAX_360_FRAME_BYTES) {
      throw new Error("Bildet er for stort");
    }
    if (!hasValid360MagicBytes(bytes, data.contentType)) {
      throw new Error("Bildefilen samsvarer ikke med oppgitt format");
    }
    const ext = extFrom360Mime(data.contentType);
    const path = `${listingId}/${data.frameOrder}.${ext}`;

    const { data: previousFrame, error: previousError } = await supabaseAdmin
      .from("listing_360_frames")
      .select("storage_path")
      .eq("listing_id", listingId)
      .eq("frame_order", data.frameOrder)
      .maybeSingle();
    if (previousError) throw previousError;

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
        listing_id: listingId,
        storage_path: path,
        frame_order: data.frameOrder,
      },
      { onConflict: "listing_id,frame_order" },
    );
    if (error) {
      if (previousFrame?.storage_path !== path) {
        await supabaseAdmin.storage.from("listing-360-frames").remove([path]);
      }
      throw error;
    }

    if (previousFrame?.storage_path && previousFrame.storage_path !== path) {
      await supabaseAdmin.storage.from("listing-360-frames").remove([previousFrame.storage_path]);
    }

    return { ok: true as const };
  });

export const completeVehicle360CaptureSession = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ token: TOKEN_SCHEMA }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("listing_360_capture_sessions")
      .select("listing_id")
      .eq("token", data.token)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) throw new Error("Opptaksøkten er utløpt eller allerede fullført");

    const { count, error: countError } = await supabaseAdmin
      .from("listing_360_frames")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", session.listing_id);
    if (countError) throw countError;
    if ((count ?? 0) < MIN_360_FRAMES) {
      throw new Error(`Ta minst ${MIN_360_FRAMES} bilder før opptaket fullføres`);
    }

    const { data: completed, error } = await supabaseAdmin
      .from("listing_360_capture_sessions")
      .update({ used_at: new Date().toISOString() })
      .eq("token", data.token)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!completed) throw new Error("Opptaksøkten er allerede fullført");
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

    const { error: expireError } = await supabaseAdmin
      .from("listing_360_capture_sessions")
      .update({ used_at: new Date().toISOString() })
      .eq("listing_id", data.listingId)
      .is("used_at", null);
    if (expireError) throw expireError;
    return { ok: true as const };
  });
