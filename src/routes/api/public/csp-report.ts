import { createFileRoute } from "@tanstack/react-router";

/**
 * Receives CSP violation reports. The endpoint is deliberately telemetry-only:
 * it accepts a small, known subset of fields and never logs browser-supplied
 * JSON wholesale.
 */
export const Route = createFileRoute("/api/public/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > 32_768) return new Response(null, { status: 413 });
        try {
          const body: unknown = await request.json();
          const reports = Array.isArray(body) ? body : [body];
          for (const item of reports.slice(0, 20)) {
            const report =
              item && typeof item === "object" && "csp-report" in item
                ? (item as { "csp-report"?: unknown })["csp-report"]
                : item;
            if (!report || typeof report !== "object") continue;
            const fields = report as Record<string, unknown>;
            const pick = (key: string) =>
              typeof fields[key] === "string" ? fields[key].slice(0, 200) : undefined;
            console.error(
              "[csp-report]",
              JSON.stringify({
                directive: pick("violated-directive"),
                blockedUri: pick("blocked-uri"),
                documentUri: pick("document-uri"),
                sourceFile: pick("source-file"),
              }),
            );
          }
        } catch {
          // Malformed report body — nothing useful to log.
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
