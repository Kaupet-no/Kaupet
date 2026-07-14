import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const categoryGroup = z.enum(["bil", "motorsykkel", "moped_atv", "bobil_campingvogn", "henger"]);

export const adminListVehicleBrandsWithModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_list_vehicle_brands_with_models");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminCreateVehicleBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ name: z.string().trim().min(1), categoryGroup }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("admin_create_vehicle_brand", {
      _name: data.name,
      _category_group: data.categoryGroup,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const adminUpdateVehicleBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid, name: z.string().trim().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("admin_update_vehicle_brand", {
      _id: data.id,
      _name: data.name,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const adminDeleteVehicleBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_delete_vehicle_brand", { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminCreateVehicleModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: uuid, name: z.string().trim().min(1) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("admin_create_vehicle_model", {
      _brand_id: data.brandId,
      _name: data.name,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const adminUpdateVehicleModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid, name: z.string().trim().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("admin_update_vehicle_model", {
      _id: data.id,
      _name: data.name,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const adminDeleteVehicleModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_delete_vehicle_model", { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

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
