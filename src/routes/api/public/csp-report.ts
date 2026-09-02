import { createFileRoute } from "@tanstack/react-router";

/**
 * Receives Content-Security-Policy violation reports (Reporting API,
 * `report-to csp`). Report-only mode was otherwise collecting nothing, so
 * the "promote once reports are quiet" plan could never actually happen.
 * See docs/SIKKERHETSVURDERING.md M-6. Logs only — no DB write, since this
 * endpoint is unauthenticated and reachable by any browser.
 */
export const Route = createFileRoute("/api/public/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body: unknown = await request.json();
          const reports = Array.isArray(body) ? body : [body];
          for (const report of reports.slice(0, 20)) {
            console.error("[csp-report]", JSON.stringify(report).slice(0, 2000));
          }
        } catch {
          // Malformed report body — nothing useful to log.
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
