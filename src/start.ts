import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// In-memory cache to avoid hitting the DB on every request.
const ipCache = new Map<string, { banned: boolean; expires: number }>();
const IP_CACHE_TTL_MS = 60_000;

function extractIp(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

// Only block write/auth requests. Read-only requests (GET/HEAD/OPTIONS) are
// always allowed so banned IPs can still browse the site.
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const ipBanMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    const request = getRequest();
    if (!request) return next();
    if (!WRITE_METHODS.has(request.method.toUpperCase())) return next();
    const ip = extractIp(request.headers);
    if (!ip) return next();

    const now = Date.now();
    const cached = ipCache.get(ip);
    let banned = false;
    if (cached && cached.expires > now) {
      banned = cached.banned;
    } else {
      const { createClient } = await import("@supabase/supabase-js");
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && key) {
        const admin = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data } = await admin.rpc("is_ip_banned", { _ip: ip });
        banned = data === true;
        ipCache.set(ip, { banned, expires: now + IP_CACHE_TTL_MS });
      }
    }

    if (banned) {
      return new Response("Tilgang nektet (IP sperret).", {
        status: 403,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  } catch (err) {
    console.error("[ip-ban-middleware]", err);
  }
  return next();
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, ipBanMiddleware],
}));
