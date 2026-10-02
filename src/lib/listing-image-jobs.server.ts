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
import { isIP } from "node:net";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  compressListingImageOnServer,
  ImageDecodeError,
  type ImageTransformer,
} from "@/lib/image-compression.server";
import { putObject } from "@/lib/r2.server";
import {
  cancelResponseBody,
  HttpDeadlineError,
  HttpResponseTooLargeError,
  readResponseBytes,
  withHttpDeadline,
} from "@/lib/http-bounded.server";
import { ALLOWED_MIME, MAX_FILE_BYTES, extFromMime, thumbPathFor } from "@/lib/storage";

export type ListingImageJobRow = Database["public"]["Tables"]["listing_image_jobs"]["Row"];

const FETCH_TIMEOUT_MS = 15_000;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024; // 20 MB — inndata kan være større enn lagringsgrensen, siden bildet komprimeres før lagring.
const MAX_REDIRECTS = 5;
const JOB_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BACKOFF_MINUTES = [1, 5, 15, 60];
const SOURCE_POLICY_ENV = "EXTERNAL_IMAGE_ALLOWED_HOSTS";

/** Feil kunden faktisk kan rette (skriv en konkret, norsk melding). */
export class CustomerImageError extends Error {}

/** Feil ved selve henting fra kilden som er tvetydig (5xx/timeout/DNS) —
 * behandles som intern/retry (kunden skal ikke straffes for en midlertidig
 * feil hos sin egen adresse), men får en annen sluttmelding enn andre
 * interne feil hvis 24-timersgrensen nås. */
export class SourceFetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

class SourcePolicyError extends Error {}

function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const labels = host.split(".");
  return (
    isIP(host) === 0 &&
    labels.length >= 2 &&
    labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)) &&
    ![
      "localhost",
      "local",
      "internal",
      "intranet",
      "lan",
      "home",
      "test",
      "invalid",
      "private",
    ].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  );
}

function getAllowedSourceHosts(): Set<string> {
  const configured = process.env[SOURCE_POLICY_ENV];
  if (!configured?.trim()) throw new SourcePolicyError(`${SOURCE_POLICY_ENV} is missing`);

  const hosts = configured.split(",").map((entry) => entry.trim());
  if (hosts.some((host) => !host)) throw new SourcePolicyError(`${SOURCE_POLICY_ENV} is invalid`);

  const normalized = hosts.map((host) => {
    let parsed: URL;
    try {
      parsed = new URL(`https://${host}`);
    } catch {
      throw new SourcePolicyError(`${SOURCE_POLICY_ENV} is invalid`);
    }
    if (
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.hostname.toLowerCase() !== host.toLowerCase() ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      !isPublicHostname(parsed.hostname)
    ) {
      throw new SourcePolicyError(`${SOURCE_POLICY_ENV} is invalid`);
    }
    return parsed.hostname.toLowerCase();
  });
  return new Set(normalized);
}

function validateSourceUrl(value: string, allowedHosts: Set<string>, base?: string): string {
  let parsed: URL;
  try {
    if (
      value.includes("\\") ||
      value.includes("#") ||
      value.split("").some((character) => {
        const code = character.charCodeAt(0);
        return code < 0x21 || (code >= 0x7f && code <= 0x9f);
      })
    ) {
      throw new Error();
    }
    parsed = new URL(value, base);
    const authority = /^https:\/\//i.test(value)
      ? value.match(/^https:\/\/([^/?#]*)/i)?.[1]
      : value.startsWith("//")
        ? value.match(/^\/\/([^/?#]*)/)?.[1]
        : undefined;
    if (authority && (authority.includes("@") || authority.includes("%"))) throw new Error();
  } catch {
    throw new CustomerImageError("Adressen svarer ikke med et bilde.");
  }
  if (
    parsed.protocol !== "https:" ||
    (parsed.port !== "" && parsed.port !== "443") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== "" ||
    !isPublicHostname(parsed.hostname) ||
    !allowedHosts.has(parsed.hostname.toLowerCase())
  ) {
    throw new CustomerImageError("Adressen svarer ikke med et bilde.");
  }
  return parsed.toString();
}

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

/** Henter kildebildet: kun https (også etter en eventuell omdirigering),
 * timeout på 15 s, maks 20 MB, og content-type/magiske bytes må stemme med
 * et av de støttede bildeformatene. Kaster `CustomerImageError` for feil
 * kunden kan rette, `SourceFetchError` for tvetydige/midlertidige feil
 * (5xx/timeout/DNS), og en vanlig `Error` for andre interne feil. */
async function fetchSourceImage(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const allowedHosts = getAllowedSourceHosts();
  let currentUrl = validateSourceUrl(url, allowedHosts);
  try {
    return await withHttpDeadline(FETCH_TIMEOUT_MS, async (signal) => {
      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
        if (signal.aborted) throw new HttpDeadlineError();
        let response: Response;
        try {
          response = await fetchImpl(currentUrl, { redirect: "manual", signal });
        } catch {
          throw new SourceFetchError("Nettverksfeil ved henting av bilde fra kilden");
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          cancelResponseBody(response);
          if (!location) throw new CustomerImageError("Adressen svarer ikke med et bilde.");
          currentUrl = validateSourceUrl(location, allowedHosts, currentUrl);
          continue;
        }
        if (response.status === 404 || response.status === 410) {
          cancelResponseBody(response);
          throw new CustomerImageError(`Bildet finnes ikke på adressen (HTTP ${response.status}).`);
        }
        if (response.status >= 400 && response.status < 500) {
          cancelResponseBody(response);
          throw new CustomerImageError(`Adressen svarte med feil (HTTP ${response.status}).`);
        }
        if (response.status >= 500) {
          cancelResponseBody(response);
          throw new SourceFetchError("Kilden svarte med serverfeil", response.status);
        }
        if (!response.ok) {
          cancelResponseBody(response);
          throw new SourceFetchError("Uventet HTTP-status fra kilden", response.status);
        }

        const contentType = (response.headers.get("content-type") ?? "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        const contentLength = response.headers.get("content-length");
        if (contentLength && Number(contentLength) > MAX_SOURCE_BYTES) {
          cancelResponseBody(response);
          throw new CustomerImageError("Bildet er større enn 20 MB.");
        }

        let bytes: Uint8Array;
        try {
          bytes = await readResponseBytes(response, MAX_SOURCE_BYTES, signal);
        } catch (cause) {
          if (cause instanceof HttpResponseTooLargeError) {
            throw new CustomerImageError("Bildet er større enn 20 MB.");
          }
          throw cause;
        }
        if (
          !(ALLOWED_MIME as readonly string[]).includes(contentType) ||
          !magicBytesMatch(contentType, bytes)
        ) {
          throw new CustomerImageError("Adressen svarer ikke med et bilde.");
        }
        return { bytes, contentType };
      }
      throw new SourceFetchError("For mange omdirigeringer ved henting av bilde");
    });
  } catch (cause) {
    if (cause instanceof HttpDeadlineError) {
      throw new SourceFetchError("Tidsavbrudd ved henting av bilde fra kilden");
    }
    throw cause;
  }
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
    const thumbKey = thumbPathFor(key);

    for (const objectKey of [key, thumbKey]) {
      const { error } = await deps.supabaseAdmin.rpc("register_standard_upload_object", {
        _bucket: "BILDER",
        _key: objectKey,
      });
      if (error) throw new Error("Kunne ikke registrere R2-opplasting");
    }

    await putObject("BILDER", key, compressed.main.bytes, compressed.main.contentType);
    await putObject("BILDER", thumbKey, compressed.thumb.bytes, compressed.thumb.contentType);

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

    const message =
      cause instanceof SourceFetchError
        ? cause.status
          ? `source_http_${cause.status}`
          : "source_fetch_error"
        : "internal_processing_error";
    const ageMs = now().getTime() - new Date(job.created_at).getTime();
    const exhausted = ageMs >= JOB_MAX_AGE_MS;

    if (exhausted) {
      const finalMessage = finalInternalCustomerMessage(cause);
      console.error("[listing-image-jobs] gir opp etter 24 timer", {
        jobId: job.id,
        listingId: job.listing_id,
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
