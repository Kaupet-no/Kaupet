import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/listings/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { withApiHandler } = await import("@/lib/api-handler.server");
        const { apiJson } = await import("@/lib/api-response.server");
        const { listListingsApi } = await import("@/features/listing-api/listing-api.server");

        return withApiHandler("read", "listings:read", async ({ auth }) => {
          const url = new URL(request.url);
          const page = await listListingsApi({ auth, searchParams: url.searchParams });
          return apiJson(page);
        })({ request });
      },
    },
  },
});
