import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/listings/$externalRef/images")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const { withApiHandler } = await import("@/lib/api-handler.server");
        const { apiJson, unsupportedMediaType } = await import("@/lib/api-response.server");
        const { replaceListingImagesApi } =
          await import("@/features/listing-api/listing-api.server");

        return withApiHandler("write", "listings:write", async ({ auth }) => {
          const contentType = request.headers.get("content-type") ?? "";
          if (!contentType.includes("application/json")) {
            // Multipart-filopplasting er ikke støttet i v1 — se docs/PROFF-API.md.
            // Kunden må sende bildene sine via en https://-URL i stedet.
            return unsupportedMediaType(
              "Filopplasting støttes ikke i v1. Send en JSON-body med «urls»: en liste med https://-lenker til bildene.",
            );
          }
          const body = await request.json().catch(() => null);
          const result = await replaceListingImagesApi({
            auth,
            externalRef: params.externalRef,
            body,
          });
          return apiJson(result);
        })({ request });
      },
    },
  },
});
