import { createFileRoute } from "@tanstack/react-router";

import { buildOpenApiDocument } from "@/features/listing-api/openapi";

// Ingen auth: OpenAPI-dokumentet er offentlig dokumentasjon, ikke en
// databaseoperasjon (se docs/PROFF-API.md).
export const Route = createFileRoute("/api/v1/openapi.json")({
  server: {
    handlers: {
      GET: async () => Response.json(buildOpenApiDocument()),
    },
  },
});
