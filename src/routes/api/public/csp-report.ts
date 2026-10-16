import { createFileRoute } from "@tanstack/react-router";

const DIRECTIVES = new Set([
  "default-src",
  "script-src",
  "style-src",
  "img-src",
  "font-src",
  "connect-src",
  "script-src-elem",
  "script-src-attr",
  "style-src-elem",
  "style-src-attr",
  "media-src",
  "object-src",
  "frame-src",
  "child-src",
  "worker-src",
  "base-uri",
  "form-action",
  "frame-ancestors",
  "manifest-src",
  "navigate-to",
  "prefetch-src",
  "plugin-types",
  "report-uri",
  "sandbox",
  "upgrade-insecure-requests",
  "block-all-mixed-content",
  "trusted-types",
  "require-trusted-types-for",
]);

function safeOrigin(value: unknown, ownOrigin: string): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return;
  if (["inline", "eval", "wasm-eval", "data:", "blob:", "filesystem:"].includes(value))
    return value;
  try {
    const url = new URL(value, ownOrigin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "other";
    if (url.origin === ownOrigin) return "same-origin";
    return "external";
  } catch {
    return "other";
  }
}

type ReportFields = { directive?: string; blocked: unknown; document: unknown; source: unknown };

/**
 * Reads both the legacy `report-uri` body (`{"csp-report": {...}}` with
 * kebab-case keys) and the Reporting API `report-to` body
 * (`{type: "csp-violation", body: {...}}` with camelCase keys).
 */
function normalizeReport(item: unknown): ReportFields | undefined {
  if (!item || typeof item !== "object") return;
  const record = item as Record<string, unknown>;
  if (record.type === "csp-violation") {
    const body = record.body;
    if (!body || typeof body !== "object") return;
    const fields = body as Record<string, unknown>;
    return {
      directive:
        typeof fields.effectiveDirective === "string" ? fields.effectiveDirective : undefined,
      blocked: fields.blockedURL,
      document: fields.documentURL,
      source: fields.sourceFile,
    };
  }
  const report = "csp-report" in record ? record["csp-report"] : record;
  if (!report || typeof report !== "object") return;
  const fields = report as Record<string, unknown>;
  const directive = fields["effective-directive"] ?? fields["violated-directive"];
  return {
    directive: typeof directive === "string" ? directive : undefined,
    blocked: fields["blocked-uri"],
    document: fields["document-uri"],
    source: fields["source-file"],
  };
}

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
        const { readResponseBytes, withHttpDeadline, HttpResponseTooLargeError } =
          await import("@/lib/http-bounded.server");
        try {
          const bytes = await withHttpDeadline(2_000, (signal) =>
            readResponseBytes(new Response(request.body), 32_768, signal),
          );
          const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
          const reports = Array.isArray(body) ? body : [body];
          const ownOrigin = new URL(request.url).origin;
          for (const item of reports.slice(0, 20)) {
            const fields = normalizeReport(item);
            if (!fields) continue;
            const directive = fields.directive?.split(/\s+/, 1)[0];
            console.error(
              "[csp-report]",
              JSON.stringify({
                directive: directive && DIRECTIVES.has(directive) ? directive : "other",
                blocked: safeOrigin(fields.blocked, ownOrigin),
                document: safeOrigin(fields.document, ownOrigin),
                source: safeOrigin(fields.source, ownOrigin),
              }),
            );
          }
        } catch (error) {
          if (error instanceof HttpResponseTooLargeError)
            return new Response(null, { status: 413 });
          // Malformed, timed-out, or unreadable report body — nothing useful to log.
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
