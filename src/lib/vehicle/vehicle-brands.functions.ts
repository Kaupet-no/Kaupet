import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Proposes a new brand/model, used only from the "we don't recognize this
 * brand/model from Statens vegvesen — is this correct?" confirmation flow in
 * the listing form. Users never type free text directly into brand/model
 * fields; this is the sole way new entries enter the dataset besides admin.
 *
 * The entry is created with status "pending" and only becomes selectable for
 * other users once an admin/moderator approves it in the admin panel — see
 * admin_list_pending_vehicle_entries / admin_approve_vehicle_brand in the
 * vehicle_brands_models migration. The submitting user's own listing can
 * still use the proposed name right away (stored as plain text on the
 * listing), it just won't appear in the dropdown for others until approved.
 */
export const createVehicleBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(80),
        categoryGroup: z.enum(["bil", "motorsykkel", "moped_atv", "bobil_campingvogn", "henger"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("vehicle_brands")
      .select("id, name, status")
      .eq("category_group", data.categoryGroup)
      .ilike("name", data.name)
      .maybeSingle();
    if (existing) return existing;

    const { data: created, error } = await supabaseAdmin
      .from("vehicle_brands")
      .insert({
        name: data.name,
        category_group: data.categoryGroup,
        status: "pending",
        submitted_by: context.userId,
      })
      .select("id, name, status")
      .single();
    if (error) throw error;
    return created;
  });

export const createVehicleModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        name: z.string().trim().min(1).max(80),
        classId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("vehicle_models")
      .select("id, name, status")
      .eq("brand_id", data.brandId)
      .ilike("name", data.name)
      .maybeSingle();
    if (existing) return existing;

    const { data: created, error } = await supabaseAdmin
      .from("vehicle_models")
      .insert({
        brand_id: data.brandId,
        class_id: data.classId ?? null,
        name: data.name,
        status: "pending",
        submitted_by: context.userId,
      })
      .select("id, name, status")
      .single();
    if (error) throw error;
    return created;
  });
