import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminRole as requireAdmin } from "@/lib/admin-auth.server";
import { requireAdminOrModeratorRole } from "@/lib/moderator-auth.server";

const reason = z.string().trim().min(1, "Begrunnelse er påkrevd").max(500);
const uuid = z.string().uuid();
const message = z.string().trim().min(1, "Melding er påkrevd").max(2000);

export const adminDisableListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid, reason }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_disable_listing", {
      _id: data.id,
      _reason: data.reason,
    });
    if (error) throw error;
    return { ok: true };
  });

export const adminEnableListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_enable_listing", {
      _id: data.id,
    });
    if (error) throw error;
    return { ok: true };
  });

export const adminBanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: uuid, reason }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_ban_user", {
      _user_id: data.userId,
      _reason: data.reason,
    });
    if (error) throw error;
    return { ok: true };
  });

export const adminUnbanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_unban_user", {
      _user_id: data.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

export const adminSuspendUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        userId: uuid,
        reason,
        days: z.number().int().min(1).max(365).default(30),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_suspend_user", {
      _user_id: data.userId,
      _reason: data.reason,
      _days: data.days,
    });
    if (error) throw error;
    return { ok: true };
  });

export const adminUnsuspendUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_unsuspend_user", {
      _user_id: data.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const ipv6 = /^[0-9a-fA-F:]+$/;

export const adminBanIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ip: z
          .string()
          .trim()
          .min(3)
          .max(45)
          .refine((v) => ipv4.test(v) || ipv6.test(v), "Ugyldig IP-adresse"),
        reason,
        expiresAt: z.string().datetime().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_ban_ip", {
      _ip: data.ip,
      _reason: data.reason,
      _expires_at: data.expiresAt ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  });

export const adminUnbanIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_unban_ip", {
      _id: data.id,
    });
    if (error) throw error;
    return { ok: true };
  });

export const submitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        listingId: uuid,
        reason: z.string().trim().min(1, "Grunn er påkrevd").max(500),
        comment: z.string().trim().max(1000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("submit_listing_report", {
      _listing_id: data.listingId,
      _reason: data.reason,
      _comment: data.comment ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });

export const adminDisableListingWithMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid, reason, message }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdminOrModeratorRole(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_disable_listing_with_message", {
      _id: data.id,
      _reason: data.reason,
      _message: data.message,
    });
    if (error) throw error;
    return { ok: true };
  });

export const adminDeleteListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid, message }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdminOrModeratorRole(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_delete_listing", {
      _id: data.id,
      _message: data.message,
    });
    if (error) throw error;
    return { ok: true };
  });

export const adminListReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdminOrModeratorRole(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("admin_list_reports", { _limit: 200 });
    if (error) throw error;
    return data ?? [];
  });

export const adminResolveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdminOrModeratorRole(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_resolve_report", { _id: data.id });
    if (error) throw error;
    return { ok: true };
  });

export const adminGrantModeratorRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_grant_moderator_role", {
      _user_id: data.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

export const adminRevokeModeratorRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_revoke_moderator_role", {
      _user_id: data.userId,
    });
    if (error) throw error;
    return { ok: true };
  });
