import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { ClientError } from "@/lib/to-client-error";

// Vises brukeren (via formatErrorMessage), så den skal være norsk og forståelig.
const NOT_LOGGED_IN = "Du må være logget inn for å gjøre dette. Logg inn og prøv igjen.";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      const missing = [
        ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
        ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
      ];
      const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Set them in .env.`;
      console.error(`[Supabase] ${message}`);
      throw new Error(message);
    }

    const request = getRequest();

    if (!request?.headers) {
      throw new ClientError(NOT_LOGGED_IN, 401);
    }

    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      throw new ClientError(NOT_LOGGED_IN, 401);
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw new ClientError(NOT_LOGGED_IN, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      throw new ClientError(NOT_LOGGED_IN, 401);
    }

    const supabase = createClient<Database>(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) {
      throw new ClientError(NOT_LOGGED_IN, 401);
    }

    if (!data.claims.sub) {
      throw new ClientError(NOT_LOGGED_IN, 401);
    }

    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  },
);
