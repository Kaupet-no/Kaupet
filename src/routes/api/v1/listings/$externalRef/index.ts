import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/listings/$externalRef/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { withApiHandler } = await import("@/lib/api-handler.server");
        const { apiJson } = await import("@/lib/api-response.server");
        const { getListingApi } = await import("@/features/listing-api/listing-api.server");

        return withApiHandler("read", "listings:read", async ({ auth }) => {
          const listing = await getListingApi({ auth, externalRef: params.externalRef });
          return apiJson(listing);
        })({ request });
      },
      PUT: async ({ request, params }) => {
        const { withApiHandler } = await import("@/lib/api-handler.server");
        const { apiJson } = await import("@/lib/api-response.server");
        const { upsertListingApi } = await import("@/features/listing-api/listing-api.server");

        return withApiHandler("write", "listings:write", async ({ auth }) => {
          const url = new URL(request.url);
          const dryRun = url.searchParams.get("dryRun") === "true";
          const body = await request.json().catch(() => null);
          const result = await upsertListingApi({
            auth,
            externalRef: params.externalRef,
            body,
            dryRun,
          });
          return apiJson(result, { status: result.status === "created" ? 201 : 200 });
        })({ request });
      },
    },
  },
});
