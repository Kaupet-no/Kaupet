/**
 * MCP-server for Proff-API-et (fase 5 — se
 * /root/.claude/plans/proff-kunder-skal-ha-mulighet-silly-crane.md): et tynt
 * JSON-RPC 2.0-lag over Model Context Protocol («Streamable HTTP»-
 * transporten, spesifikasjonens uttrykk) rundt akkurat de samme
 * tjenestefunksjonene som `/api/v1/…` (`src/features/listing-api/listing-api.server.ts`),
 * gjennom de tynne verktøy-innpakningene i `src/features/listing-api/mcp-tools.ts`.
 *
 * **Stateless**: ingen `Mcp-Session-Id`/sesjonslagring — hvert POST-kall
 * autentiseres og håndteres uavhengig, akkurat som `/api/v1/…`. Svar er alltid
 * ett enkelt JSON-objekt (ikke SSE) — MCP-spesifikasjonen tillater dette for
 * en server som ikke trenger å pushe flere meldinger per kall, og det er alt
 * en tynn REST-innpakning trenger. `GET`/`DELETE` (SSE-strøm/sesjons-
 * terminering i den fulle spesifikasjonen) gir `405`, siden vi ikke har noen
 * sesjon å strømme til eller avslutte.
 *
 * **Hvorfor ikke `@modelcontextprotocol/sdk`**: SDK-ens HTTP-transport
 * (`StreamableHTTPServerTransport`) er bygget rundt Node sin
 * `http.IncomingMessage`/`http.ServerResponse` (og forventer å styre
 * sesjonslivssyklusen selv), ikke web-standard `Request`/`Response` som
 * TanStack Start sine server-handlers bruker på Cloudflare Workers. Å bruke
 * SDK-en ville krevd enten en Node-kompatibilitetsserver foran denne ruten
 * (som Cloudflare Workers ikke støtter) eller en egen web-adapter rundt SDK-
 * ens interne transport-API — mer kode og en tyngre avhengighet enn å
 * implementere den lille, veldefinerte delmengden av JSON-RPC 2.0 MCP faktisk
 * bruker (`initialize`, `notifications/initialized`, `ping`, `tools/list`,
 * `tools/call`) direkte mot `Request`/`Response`, slik resten av `/api/v1/…`
 * allerede er skrevet. Se rapporten for denne fasen for detaljer.
 *
 * **Autentisering** skjer FØR JSON-RPC-parsing (manglende/ugyldig
 * `Authorization: Bearer <nøkkel>` gir `401` med `WWW-Authenticate: Bearer`
 * med det samme, uansett hva body inneholder) — akkurat som `/api/v1/…`,
 * samme nøkler/scope/rategrenser (`api-keys.server.ts`/`api-rate-limit.server.ts`).
 * Deretter telles hvert `tools/call` mot samme rategrense-bøtte
 * (`read`/`write`/`batch`, satt per verktøy i `mcp-tools.ts`) og krever samme
 * scope som REST-endepunktet verktøyet speiler.
 *
 * **Verktøyfeil** (forretningsfeil, valideringsfeil, scope, rategrense)
 * returneres som et `tools/call`-RESULTAT med `isError: true` og norsk tekst
 * (HTTP 200, gyldig JSON-RPC-svar) — ikke som en JSON-RPC-protokollfeil. Det
 * er slik MCP-spesifikasjonen anbefaler at «verktøyet feilet»-tilfeller
 * håndteres, og lar en LLM-klient lese/resonnere over feilen som tekst i
 * stedet for å måtte spesialhåndtere protokollfeil for hver forretningsregel.
 * Protokollfeil (-32700/-32600/-32601/-32602) er reservert for faktiske
 * JSON-RPC-/transportfeil: ugyldig JSON, feil form på kallet, ukjent metode
 * eller ukjent verktøynavn.
 */
import { createFileRoute } from "@tanstack/react-router";

const JSONRPC_VERSION = "2.0";
/** Versjonen vi selv snakker — sendes tilbake uendret når klienten ber om
 * akkurat denne, ellers som vårt forslag (stateless, ingen forhandlingshistorikk
 * å ta hensyn til). */
const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "kaupet-proff", version: "1.0.0" } as const;

type JsonRpcId = string | number | null;

type JsonRpcRequestBody = {
  jsonrpc?: unknown;
  id?: JsonRpcId;
  method?: unknown;
  params?: unknown;
};

function jsonRpcResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function jsonRpcResult(id: JsonRpcId, result: unknown): Response {
  return jsonRpcResponse({ jsonrpc: JSONRPC_VERSION, id, result });
}

/** Protokollfeil — se filkommentaren for hvorfor dette IKKE brukes for
 * forretnings-/validerings-/scope-/rategrensefeil fra et verktøy. */
function jsonRpcProtocolError(
  id: JsonRpcId,
  code: number,
  message: string,
  status = 200,
): Response {
  return jsonRpcResponse({ jsonrpc: JSONRPC_VERSION, id, error: { code, message } }, status);
}

function methodNotAllowed(): Response {
  return Response.json(
    {
      error:
        "MCP-endepunktet er stateless: kun POST støttes (ingen SSE-strøm via GET, ingen sesjon å avslutte via DELETE).",
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}

function toolErrorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function toolSuccessResult(text: string, structured: unknown) {
  return { content: [{ type: "text" as const, text }], structuredContent: structured };
}

/**
 * Strukturell (duck-typed) gjenkjennelse av `ListingApiError`/verktøyfeil,
 * IDENTISK med den private `isBusinessError` i `src/lib/api-handler.server.ts`
 * — se kommentaren der for hvorfor duck-typing i stedet for `instanceof`
 * brukes (unngår et statisk `*.server`-import av én bestemt feature sin
 * feilklasse fra et delt lag). Duplisert her av samme grunn.
 */
type BusinessError = {
  isApiBusinessError: true;
  status: number;
  code: string;
  message: string;
  field?: string;
};

function isBusinessError(error: unknown): error is BusinessError {
  const status = (error as { status?: unknown } | null)?.status;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isApiBusinessError?: unknown }).isApiBusinessError === true &&
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

function businessErrorText(error: BusinessError): string {
  return error.field ? `${error.message} (felt: ${error.field})` : error.message;
}

async function handleToolsCall(
  id: JsonRpcId,
  auth: Awaited<ReturnType<typeof import("@/lib/api-keys.server").authenticateApiKey>>,
  rawParams: unknown,
): Promise<Response> {
  const params = (rawParams ?? {}) as { name?: unknown; arguments?: unknown };
  if (typeof params.name !== "string" || !params.name) {
    return jsonRpcProtocolError(id, -32602, "Invalid params: «name» må være en streng.");
  }

  const { findMcpTool } = await import("@/features/listing-api/mcp-tools");
  const tool = findMcpTool(params.name);
  if (!tool) {
    return jsonRpcProtocolError(id, -32602, `Ukjent verktøy: «${params.name}».`);
  }
  const args =
    typeof params.arguments === "object" && params.arguments !== null
      ? (params.arguments as Record<string, unknown>)
      : {};

  const { consumeApiRateLimit, apiRateLimitHeaders } = await import("@/lib/api-rate-limit.server");
  // Telles uansett scope-utfall, akkurat som `withApiHandler` for REST
  // (samme rekkefølge: autentisert nøkkel bruker alltid opp litt av
  // rategrensen sin, selv om kallet avvises av andre grunner rett etter).
  const rateLimit = await consumeApiRateLimit(auth.keyId, tool.rateLimitKind);
  const rateLimitHeaders = apiRateLimitHeaders(rateLimit);

  const attachHeaders = (response: Response): Response => {
    for (const [key, value] of Object.entries(rateLimitHeaders)) response.headers.set(key, value);
    return response;
  };

  if (!auth.scopes.includes(tool.scope)) {
    return attachHeaders(
      jsonRpcResult(
        id,
        toolErrorResult(
          `Denne API-nøkkelen mangler tilgangen «${tool.scope}», som verktøyet «${tool.name}» krever.`,
        ),
      ),
    );
  }
  if (!rateLimit.allowed) {
    return attachHeaders(
      jsonRpcResult(
        id,
        toolErrorResult(
          `Rategrensen for ${tool.rateLimitKind}-kall er nådd (${rateLimit.limit} per time). ` +
            `Prøv igjen om ca. ${rateLimit.retryAfterSeconds} sekunder (${rateLimit.resetAt.toISOString()}).`,
        ),
      ),
    );
  }

  try {
    const result = await tool.execute(auth, args);
    return attachHeaders(jsonRpcResult(id, toolSuccessResult(result.text, result.structured)));
  } catch (error) {
    if (isBusinessError(error)) {
      return attachHeaders(jsonRpcResult(id, toolErrorResult(businessErrorText(error))));
    }
    console.error(`[api/mcp] Uventet feil i verktøyet «${tool.name}»`, error);
    return attachHeaders(
      jsonRpcResult(id, toolErrorResult("En intern feil oppstod på serveren. Prøv igjen senere.")),
    );
  }
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      GET: async () => methodNotAllowed(),
      DELETE: async () => methodNotAllowed(),
      POST: async ({ request }) => {
        const { authenticateApiKey, ApiAuthError } = await import("@/lib/api-keys.server");
        const { apiError } = await import("@/lib/api-response.server");

        // Auth FØR JSON-RPC-parsing — se filkommentaren.
        let auth: Awaited<ReturnType<typeof authenticateApiKey>>;
        try {
          auth = await authenticateApiKey(request);
        } catch (error) {
          if (error instanceof ApiAuthError) {
            const response = apiError(error.status, error.code, error.message);
            response.headers.set("WWW-Authenticate", "Bearer");
            return response;
          }
          console.error("[api/mcp] Uventet autentiseringsfeil", error);
          return apiError(
            500,
            "internal_error",
            "En intern feil oppstod på serveren. Prøv igjen senere.",
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonRpcProtocolError(null, -32700, "Parse error: ugyldig JSON.", 400);
        }

        if (Array.isArray(body)) {
          return jsonRpcProtocolError(
            null,
            -32600,
            "Invalid Request: batch-forespørsler støttes ikke (stateless server).",
            400,
          );
        }
        if (typeof body !== "object" || body === null) {
          return jsonRpcProtocolError(null, -32600, "Invalid Request", 400);
        }

        const req = body as JsonRpcRequestBody;
        const hasId = Object.prototype.hasOwnProperty.call(req, "id");
        const id: JsonRpcId =
          hasId && (typeof req.id === "string" || typeof req.id === "number" || req.id === null)
            ? req.id
            : null;

        if (req.jsonrpc !== "2.0" || typeof req.method !== "string" || !req.method) {
          return jsonRpcProtocolError(hasId ? id : null, -32600, "Invalid Request", 400);
        }

        // Notifikasjon (ingen "id"): MCP/JSON-RPC krever at serveren ALDRI
        // svarer med et JSON-RPC-svar for disse — kun 202 uten body. Gjelder
        // generisk for alle notifikasjoner (kun `notifications/initialized`
        // er reelt i bruk i dag), ikke bare den ene metoden.
        if (!hasId) {
          return new Response(null, { status: 202 });
        }

        switch (req.method) {
          case "initialize": {
            const params = (req.params ?? {}) as { protocolVersion?: unknown };
            const protocolVersion =
              typeof params.protocolVersion === "string"
                ? params.protocolVersion
                : PROTOCOL_VERSION;
            return jsonRpcResult(id, {
              protocolVersion,
              serverInfo: SERVER_INFO,
              capabilities: { tools: {} },
            });
          }
          case "ping":
            return jsonRpcResult(id, {});
          case "tools/list": {
            const { MCP_TOOLS } = await import("@/features/listing-api/mcp-tools");
            return jsonRpcResult(id, {
              tools: MCP_TOOLS.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
                ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
                ...(tool.annotations ? { annotations: tool.annotations } : {}),
              })),
            });
          }
          case "tools/call":
            return handleToolsCall(id, auth, req.params);
          default:
            return jsonRpcProtocolError(id, -32601, `Method not found: ${req.method}`);
        }
      },
    },
  },
});
