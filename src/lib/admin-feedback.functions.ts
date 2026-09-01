import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminRole } from "@/lib/admin-auth.server";

export type AdminFeedbackRow = {
  id: string;
  type: "ris" | "ros" | "kategori";
  message: string;
  category_name: string | null;
  category_description: string | null;
  created_at: string;
  user_id: string | null;
  display_name: string | null;
  page_url: string | null;
};

const listSchema = z.object({
  typeFilter: z.enum(["ris", "ros", "kategori"]).nullable().optional(),
  sortBy: z.enum(["created_at", "type"]).optional().default("created_at"),
  ascending: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(200).optional().default(100),
  offset: z.number().int().min(0).optional().default(0),
});

export const adminListFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => listSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("feedback")
      .select(
        "id, type, message, category_name, category_description, created_at, user_id, page_url",
        { count: "exact" },
      )
      .order(data.sortBy, { ascending: data.ascending })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.typeFilter) query = query.eq("type", data.typeFilter);

    const { data: rows, error, count } = await query;
    if (error) throw error;

    // Attach display names for logged-in submitters ("anonym bruker" otherwise).
    const userIds = [
      ...new Set((rows ?? []).map((r) => r.user_id).filter((v): v is string => !!v)),
    ];
    const names = new Map<string, string | null>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      for (const p of profiles ?? []) names.set(p.id, p.display_name);
    }

    const result: AdminFeedbackRow[] = (rows ?? []).map((r) => ({
      id: r.id,
      type: r.type as "ris" | "ros" | "kategori",
      message: r.message,
      category_name: r.category_name,
      category_description: r.category_description,
      created_at: r.created_at,
      user_id: r.user_id,
      display_name: r.user_id ? (names.get(r.user_id) ?? null) : null,
      page_url: r.page_url,
    }));
    return { rows: result, total: count ?? 0 };
  });

export const adminDeleteFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("feedback").delete().in("id", data.ids);
    if (error) throw error;
  });
