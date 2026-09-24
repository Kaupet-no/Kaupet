// Prosesserer én rad fra `listing_image_jobs` (se
// supabase/migrations/20260924130000_listing_image_jobs.sql): henter kilde-
// bildet, komprimerer det server-side med samme presets som veiviseren
// (image-compression.server.ts → image-presets.ts), lagrer i R2 og setter
// inn `listing_images`.
//
// **Kjernekravet fra bruker: feil VI eier vises ALDRI som en kundefeil.**
// Denne modulen klassifiserer hver feil i to grupper:
//   - Kundefeil (kunden kan rette det): URL-en finnes ikke (404/410), annen
//     4xx, adressen er ikke et bilde (feil content-type/magiske bytes),
//     bildet er over 20 MB, eller bildet er skadet (dekodefeil). Jobben
//     markeres 'failed' med en konkret norsk `customer_error`.
//   - Intern feil (vi eier det): 5xx/timeout/DNS hos kilden, Cloudflare
//     Images-bindingen mangler/feiler, kvote, R2-feil, DB-feil. Jobben går
//     TILBAKE til 'pending' med eksponentiell backoff (1, 5, 15, 60 min …)
//     og `internal_error` fylles — `customer_error` forblir NULL. Etter
//     24 timer totalt (fra jobbens `created_at`) gir vi opp og setter
//     'failed' med en tydelig, ufarlig kundetekst + logger for drift.
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  compressListingImageOnServer,
  ImageDecodeError,
  type ImageTransformer,
} from "@/lib/image-compression.server";
import { putObject } from "@/lib/r2.server";
import { ALLOWED_MIME, MAX_FILE_BYTES, extFromMime, thumbPathFor } from "@/lib/storage";

export type ListingImageJobRow = Database["public"]["Tables"]["listing_image_jobs"]["Row"];

const FETCH_TIMEOUT_MS = 15_000;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024; // 20 MB — inndata kan være større enn lagringsgrensen, siden bildet komprimeres før lagring.
const MAX_REDIRECTS = 5;
const JOB_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BACKOFF_MINUTES = [1, 5, 15, 60];

/** Feil kunden faktisk kan rette (skriv en konkret, norsk melding). */
export class CustomerImageError extends Error {}

/** Feil ved selve henting fra kilden som er tvetydig (5xx/timeout/DNS) —
 * behandles som intern/retry (kunden skal ikke straffes for en midlertidig
 * feil hos sin egen adresse), men får en annen sluttmelding enn andre
 * interne feil hvis 24-timersgrensen nås. */
export class SourceFetchError extends Error {}

function backoffMinutesFor(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1) - 1, BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[index];
}

function magicBytesMatch(contentType: string, bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  switch (contentType) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    case "image/webp":
      return (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
      );
    case "image/jxl":
      // To gyldige JPEG XL-signaturer: rå kodestrøm (FF 0A) eller
      // ISO-BMFF-beholder ("JXL " boksen).
      return (
        (bytes[0] === 0xff && bytes[1] === 0x0a) ||
        (bytes[0] === 0x00 &&
          bytes[1] === 0x00 &&
          bytes[2] === 0x00 &&
          bytes[3] === 0x0c &&
          bytes[4] === 0x4a &&
          bytes[5] === 0x58 &&
          bytes[6] === 0x4c &&
          bytes[7] === 0x20)
      );
    default:
      return false;
  }
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    const buf = await response.arrayBuffer();
    if (buf.byteLength > maxBytes) throw new CustomerImageError("Bildet er større enn 20 MB.");
    return new Uint8Array(buf);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new CustomerImageError("Bildet er større enn 20 MB.");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

/** Henter kildebildet: kun https (også etter en eventuell omdirigering),
 * timeout på 15 s, maks 20 MB, og content-type/magiske bytes må stemme med
 * et av de støttede bildeformatene. Kaster `CustomerImageError` for feil
 * kunden kan rette, `SourceFetchError` for tvetydige/midlertidige feil
 * (5xx/timeout/DNS), og en vanlig `Error` for andre interne feil. */
async function fetchSourceImage(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  let currentUrl = url;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    if (!currentUrl.startsWith("https://")) {
      throw new CustomerImageError("Adressen svarer ikke med et bilde.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, { redirect: "manual", signal: controller.signal });
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new SourceFetchError(`Tidsavbrudd ved henting av bilde fra ${currentUrl}`);
      }
      throw new SourceFetchError(
        `Nettverksfeil ved henting av bilde fra ${currentUrl}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new SourceFetchError("Omdirigering uten Location-header");
      // new URL(..., base) løser relative Location-headere; en absolutt
      // http://-URL her blir avvist av https-sjekken øverst i neste runde —
      // det er selve SSRF/protokoll-nedgraderings-forsvaret.
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    if (response.status === 404 || response.status === 410) {
      throw new CustomerImageError(`Bildet finnes ikke på adressen (HTTP ${response.status}).`);
    }
    if (response.status >= 400 && response.status < 500) {
      throw new CustomerImageError(`Adressen svarte med feil (HTTP ${response.status}).`);
    }
    if (response.status >= 500) {
      throw new SourceFetchError(`Kilden svarte med serverfeil (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new SourceFetchError(`Uventet HTTP-status ${response.status} fra kilden`);
    }

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_SOURCE_BYTES) {
      throw new CustomerImageError("Bildet er større enn 20 MB.");
    }

    const bytes = await readBodyWithLimit(response, MAX_SOURCE_BYTES);
    if (
      !(ALLOWED_MIME as readonly string[]).includes(contentType) ||
      !magicBytesMatch(contentType, bytes)
    ) {
      throw new CustomerImageError("Adressen svarer ikke med et bilde.");
    }
    return { bytes, contentType };
  }
  throw new SourceFetchError("For mange omdirigeringer ved henting av bilde");
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function finalInternalCustomerMessage(cause: unknown): string {
  if (cause instanceof SourceFetchError) {
    return "Bildet kunne ikke hentes fra adressen etter gjentatte forsøk.";
  }
  return "Bildet kunne ikke behandles på grunn av en feil hos Kaupet. Vi følger opp.";
}

export type ProcessJobDeps = {
  supabaseAdmin: SupabaseClient<Database>;
  transformer: ImageTransformer;
  /** Injiserbar for tester; standard er den globale `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injiserbar for tester (24-timersgrensen). */
  now?: () => Date;
};

export type ProcessJobOutcome =
  | { outcome: "done"; jobId: string; storagePath: string }
  | { outcome: "customer_failed"; jobId: string; message: string }
  | { outcome: "retry_pending"; jobId: string; nextAttemptAt: string }
  | { outcome: "internal_failed"; jobId: string; message: string };

export async function processListingImageJob(
  job: ListingImageJobRow,
  deps: ProcessJobDeps,
): Promise<ProcessJobOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());

  try {
    const { bytes, contentType } = await fetchSourceImage(job.source_url, fetchImpl);

    let compressed;
    try {
      compressed = await compressListingImageOnServer(bytes, contentType, deps.transformer);
    } catch (cause) {
      if (cause instanceof ImageDecodeError) {
        throw new CustomerImageError("Bildet kunne ikke leses (skadet fil).");
      }
      throw cause;
    }
    if (
      compressed.main.bytes.byteLength > MAX_FILE_BYTES ||
      compressed.thumb.bytes.byteLength > MAX_FILE_BYTES
    ) {
      // Se image-compression.server.ts: dette er en begrensning i
      // komprimeringen vår, ikke noe kunden kan rette — behandles som intern.
      throw new Error("Komprimert bilde overskrider lagringsgrensen");
    }

    const hash = sha256Hex(compressed.main.bytes);
    const key = `${job.listing_id}/${crypto.randomUUID()}.${extFromMime(compressed.main.contentType)}`;

    await putObject("BILDER", key, compressed.main.bytes, compressed.main.contentType);
    await putObject(
      "BILDER",
      thumbPathFor(key),
      compressed.thumb.bytes,
      compressed.thumb.contentType,
    );

    const { error: insertError } = await deps.supabaseAdmin.from("listing_images").insert({
      listing_id: job.listing_id,
      storage_path: key,
      sort_order: job.sort_order,
      source_url: job.source_url,
    });
    if (insertError) throw new Error(`Kunne ikke lagre bilderad: ${insertError.message}`);

    const { error: updateError } = await deps.supabaseAdmin
      .from("listing_image_jobs")
      .update({
        status: "done",
        storage_path: key,
        content_hash: hash,
        transformations: compressed.transformations,
        customer_error: null,
        internal_error: null,
      })
      .eq("id", job.id);
    if (updateError) throw new Error(`Kunne ikke oppdatere jobbstatus: ${updateError.message}`);

    return { outcome: "done", jobId: job.id, storagePath: key };
  } catch (cause) {
    if (cause instanceof CustomerImageError) {
      await deps.supabaseAdmin
        .from("listing_image_jobs")
        .update({ status: "failed", customer_error: cause.message, internal_error: null })
        .eq("id", job.id);
      return { outcome: "customer_failed", jobId: job.id, message: cause.message };
    }

    const message = cause instanceof Error ? cause.message : String(cause);
    const ageMs = now().getTime() - new Date(job.created_at).getTime();
    const exhausted = ageMs >= JOB_MAX_AGE_MS;

    if (exhausted) {
      const finalMessage = finalInternalCustomerMessage(cause);
      console.error("[listing-image-jobs] gir opp etter 24 timer", {
        jobId: job.id,
        listingId: job.listing_id,
        sourceUrl: job.source_url,
        internalError: message,
      });
      await deps.supabaseAdmin
        .from("listing_image_jobs")
        .update({ status: "failed", customer_error: finalMessage, internal_error: message })
        .eq("id", job.id);
      return { outcome: "internal_failed", jobId: job.id, message: finalMessage };
    }

    const backoffMinutes = backoffMinutesFor(job.attempts);
    const nextAttemptAt = new Date(now().getTime() + backoffMinutes * 60_000).toISOString();
    console.error("[listing-image-jobs] intern feil, prøver på nytt", {
      jobId: job.id,
      listingId: job.listing_id,
      sourceUrl: job.source_url,
      internalError: message,
      nextAttemptAt,
    });
    await deps.supabaseAdmin
      .from("listing_image_jobs")
      .update({ status: "pending", next_attempt_at: nextAttemptAt, internal_error: message })
      .eq("id", job.id);
    return { outcome: "retry_pending", jobId: job.id, nextAttemptAt };
  }
}
