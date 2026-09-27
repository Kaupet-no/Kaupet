/**
 * Serverfunksjoner for «Integrasjoner»-seksjonen i bedriftskonsollet (fase 4,
 * del 1). Kun organisasjonens superbrukere kan liste/opprette/tilbakekalle
 * API-nøkler eller se forbruk — se kravet i planens fase 4.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { toClientError } from "@/lib/to-client-error";
import { INTEGRATION_LIMITS } from "@/lib/integration-limits";

type AdminClient = SupabaseClient<Database>;

const UNAUTHORIZED_MESSAGE = "Du har ikke tilgang til API-nøkler.";

async function requireSuperuserOrganization(
  userId: string,
): Promise<{ supabaseAdmin: AdminClient; organizationId: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: membership, error } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw await toClientError("database", error);
  if (!membership || membership.role !== "superuser") throw new Error(UNAUTHORIZED_MESSAGE);
  return { supabaseAdmin, organizationId: membership.organization_id as string };
}

/**
 * `create_organization_api_key`/`revoke_organization_api_key` kaster kun
 * faste, allerede kundevendte norske tekster (se
 * 20260924140000_organization_api_keys.sql) — ingen brukerinnhold
 * interpoleres inn i dem. De videreformidles derfor uendret i stedet for å
 * gå via `toClientError` (som ellers ville sanert dem bort, se
 * `sanitizeClientError`/SAFE_CODE_MESSAGES i to-client-error.ts og
 * business.functions.ts sitt tilsvarende, men ikke fullt konsekvente,
 * mønster). Uventede feil (DB nede o.l.) mangler `message`/har en annen
 * `code` og faller uansett tilbake på den generelle sanerte teksten via
 * `toClientError` i kallerne.
 */
function forwardKnownRpcError(error: { message?: string; code?: string }): never {
  if (typeof error.message === "string" && error.message.length > 0 && error.code === "P0001") {
    throw new Error(error.message);
  }
  throw new Error("Noe gikk galt. Prøv igjen senere.");
}

export type ApiKeySummary = {
  id: string;
  name: string;
  keyPrefix: string;
  defaultLocationId: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const { data, error } = await supabaseAdmin
      .from("organization_api_keys")
      .select(
        "id, name, key_prefix, default_location_id, scopes, created_at, expires_at, last_used_at, revoked_at",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) throw await toClientError("database", error);
    const keys: ApiKeySummary[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      keyPrefix: row.key_prefix,
      defaultLocationId: row.default_location_id,
      scopes: row.scopes,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
    }));
    return { keys };
  });

const scopeSchema = z.enum(["listings:read", "listings:write"]);
const lifetimeDaysSchema = z
  .number()
  .int()
  .refine((value) => (INTEGRATION_LIMITS.apiKey.lifetimeOptionsDays as number[]).includes(value), {
    message: "Ugyldig varighet.",
  });

const createApiKeySchema = z.object({
  name: z.string().trim().min(1, "Navn må fylles ut.").max(60, "Navn kan være maks 60 tegn."),
  defaultLocationId: z.string().uuid(),
  scopes: z.array(scopeSchema).min(1, "Velg minst én tilgang."),
  lifetimeDays: lifetimeDaysSchema,
});

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createApiKeySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const { generateApiKey } = await import("@/lib/api-keys.server");
    const generated = await generateApiKey();

    const { data: row, error } = await supabaseAdmin.rpc("create_organization_api_key", {
      _organization_id: organizationId,
      _user_id: context.userId,
      _name: data.name,
      _default_location_id: data.defaultLocationId,
      _scopes: data.scopes,
      _lifetime_days: data.lifetimeDays,
      _key_prefix: generated.prefix,
      _key_hash: generated.hash,
    });
    if (error) forwardKnownRpcError(error);

    const key: ApiKeySummary = {
      id: row.id,
      name: row.name,
      keyPrefix: row.key_prefix,
      defaultLocationId: row.default_location_id,
      scopes: row.scopes,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
    };
    // Klartekstnøkkelen returneres KUN her — den lagres aldri, og kan ikke
    // hentes frem igjen senere (verken av API-et eller UI-en).
    return { key, plaintext: generated.plaintext };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ keyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await requireSuperuserOrganization(context.userId);
    const { error } = await supabaseAdmin.rpc("revoke_organization_api_key", {
      _key_id: data.keyId,
      _user_id: context.userId,
    });
    if (error) forwardKnownRpcError(error);
  });

export type ApiKeyUsage = {
  keyId: string;
  read: { count: number; limit: number; resetAt: string };
  write: { count: number; limit: number; resetAt: string };
  batch: { count: number; limit: number; resetAt: string };
};

export type OrganizationUsage = {
  newListingsToday: number;
  newImagesToday: number;
  imagesProcessing: number;
  imagesFailed: number;
};

export type IntegrationUsage = {
  keys: ApiKeyUsage[];
  organization: OrganizationUsage;
  limits: typeof INTEGRATION_LIMITS;
};

/** UTC-midnatt for "i dag" — samme grense som listing-sync.server.ts bruker
 * til å håndheve `INTEGRATION_LIMITS.organization.newListingsPerDay`/
 * `newImagesPerDay`, slik at tallene her aldri kan avvike fra det som faktisk
 * håndheves. */
function startOfUtcDayIso(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

export const getIntegrationUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntegrationUsage> => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const { peekApiRateLimit } = await import("@/lib/api-rate-limit.server");

    const { data: keyRows, error: keysError } = await supabaseAdmin
      .from("organization_api_keys")
      .select("id")
      .eq("organization_id", organizationId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString());
    if (keysError) throw await toClientError("database", keysError);

    const keys: ApiKeyUsage[] = await Promise.all(
      (keyRows ?? []).map(async (row) => {
        const [read, write, batch] = await Promise.all([
          peekApiRateLimit(row.id, "read"),
          peekApiRateLimit(row.id, "write"),
          peekApiRateLimit(row.id, "batch"),
        ]);
        const toUsage = (value: typeof read) => ({
          count: value.limit - value.remaining,
          limit: value.limit,
          resetAt: value.resetAt.toISOString(),
        });
        return { keyId: row.id, read: toUsage(read), write: toUsage(write), batch: toUsage(batch) };
      }),
    );

    const todayIso = startOfUtcDayIso();
    const [
      { count: newListingsToday, error: listingsError },
      { count: newImagesToday, error: newImagesError },
      { count: imagesProcessing, error: processingError },
      { count: imagesFailed, error: failedError },
    ] = await Promise.all([
      supabaseAdmin
        .from("organization_listing_imports")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "created")
        .gte("created_at", todayIso),
      supabaseAdmin
        .from("listing_image_jobs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", todayIso),
      supabaseAdmin
        .from("listing_image_jobs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("status", ["pending", "processing"]),
      supabaseAdmin
        .from("listing_image_jobs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "failed"),
    ]);
    if (listingsError) throw await toClientError("database", listingsError);
    if (newImagesError) throw await toClientError("database", newImagesError);
    if (processingError) throw await toClientError("database", processingError);
    if (failedError) throw await toClientError("database", failedError);

    return {
      keys,
      organization: {
        newListingsToday: newListingsToday ?? 0,
        newImagesToday: newImagesToday ?? 0,
        imagesProcessing: imagesProcessing ?? 0,
        imagesFailed: imagesFailed ?? 0,
      },
      limits: INTEGRATION_LIMITS,
    };
  });
