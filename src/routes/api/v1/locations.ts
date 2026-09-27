import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/locations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { withApiHandler } = await import("@/lib/api-handler.server");
        const { apiJson } = await import("@/lib/api-response.server");
        const { listLocationsApi } = await import("@/features/listing-api/listing-api.server");

        return withApiHandler("read", "listings:read", async ({ auth }) => {
          const items = await listLocationsApi(auth);
          return apiJson({ items });
        })({ request });
      },
    },
  },
});
