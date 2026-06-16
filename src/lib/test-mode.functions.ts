import { createServerFn } from "@tanstack/react-start";
import { setCookie, deleteCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TEST_MODE_COOKIE } from "@/lib/env";

const schema = z.object({ enabled: z.boolean() });

export const setTestMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => schema.parse(i))
  .handler(async ({ data, context }) => {
    // Authorize: only admin or demo roles may toggle test-modus.
    const { data: rows, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "demo"])
      .limit(1);
    if (error) throw error;
    if (!rows || rows.length === 0) throw new Error("Ikke autorisert");

    if (data.enabled) {
      setCookie(TEST_MODE_COOKIE, "1", {
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        httpOnly: false,
      });
    } else {
      deleteCookie(TEST_MODE_COOKIE, { path: "/" });
    }
    return { enabled: data.enabled };
  });
