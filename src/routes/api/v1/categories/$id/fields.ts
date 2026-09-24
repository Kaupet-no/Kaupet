import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/categories/$id/fields")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { withApiHandler } = await import("@/lib/api-handler.server");
        const { apiJson } = await import("@/lib/api-response.server");
        const { getCategoryFieldsApi } = await import("@/features/listing-api/listing-api.server");

        return withApiHandler("read", "listings:read", async () => {
          const items = await getCategoryFieldsApi(params.id);
          return apiJson({ items });
        })({ request });
      },
    },
  },
});
