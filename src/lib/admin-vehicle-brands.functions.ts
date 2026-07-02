import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export const adminListPendingVehicleEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_list_pending_vehicle_entries");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminApproveVehicleBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_approve_vehicle_brand", { _id: data.id });
    if (error) throw error;
    return { ok: true };
  });

export const adminRejectVehicleBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_reject_vehicle_brand", { _id: data.id });
    if (error) throw error;
    return { ok: true };
  });

export const adminApproveVehicleModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_approve_vehicle_model", { _id: data.id });
    if (error) throw error;
    return { ok: true };
  });

export const adminRejectVehicleModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_reject_vehicle_model", { _id: data.id });
    if (error) throw error;
    return { ok: true };
  });
