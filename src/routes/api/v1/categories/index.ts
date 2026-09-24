import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/categories/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { withApiHandler } = await import("@/lib/api-handler.server");
        const { apiJson } = await import("@/lib/api-response.server");
        const { listCategoriesApi } = await import("@/features/listing-api/listing-api.server");

        return withApiHandler("read", "listings:read", async () => {
          const items = await listCategoriesApi();
          return apiJson({ items });
        })({ request });
      },
    },
  },
});
