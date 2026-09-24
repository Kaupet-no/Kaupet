import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/listings/$externalRef/status")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { withApiHandler } = await import("@/lib/api-handler.server");
        const { apiJson } = await import("@/lib/api-response.server");
        const { setListingStatusApi } = await import("@/features/listing-api/listing-api.server");

        return withApiHandler("write", "listings:write", async ({ auth }) => {
          const body = await request.json().catch(() => null);
          const result = await setListingStatusApi({ auth, externalRef: params.externalRef, body });
          return apiJson(result);
        })({ request });
      },
    },
  },
});
