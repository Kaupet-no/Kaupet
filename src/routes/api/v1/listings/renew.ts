import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/listings/renew")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { withApiHandler } = await import("@/lib/api-handler.server");
        const { apiJson } = await import("@/lib/api-response.server");
        const { renewListingsApi } = await import("@/features/listing-api/listing-api.server");

        return withApiHandler("batch", "listings:write", async ({ auth }) => {
          const body = await request.json().catch(() => null);
          const result = await renewListingsApi({ auth, body });
          return apiJson(result);
        })({ request });
      },
    },
  },
});
