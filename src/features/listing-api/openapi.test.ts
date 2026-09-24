import { describe, expect, it } from "vitest";

import { INTEGRATION_LIMITS } from "@/lib/integration-limits";
import { buildOpenApiDocument } from "./openapi";

describe("buildOpenApiDocument", () => {
  const doc = buildOpenApiDocument();

  it("er en gyldig 3.1-struktur med bearer-auth", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
  });

  it("lister alle endepunktene fra planen", () => {
    expect(Object.keys(doc.paths).sort()).toEqual(
      [
        "/categories",
        "/categories/{id}/fields",
        "/listings",
        "/listings/batch",
        "/listings/renew",
        "/listings/{externalRef}",
        "/listings/{externalRef}/status",
        "/listings/{externalRef}/images",
        "/locations",
        "/openapi.json",
      ].sort(),
    );
  });

  it("har GET/PUT/POST der planen krever det", () => {
    expect(doc.paths["/categories"]).toHaveProperty("get");
    expect(doc.paths["/categories/{id}/fields"]).toHaveProperty("get");
    expect(doc.paths["/locations"]).toHaveProperty("get");
    expect(doc.paths["/listings"]).toHaveProperty("get");
    expect(doc.paths["/listings/{externalRef}"]).toHaveProperty("get");
    expect(doc.paths["/listings/{externalRef}"]).toHaveProperty("put");
    expect(doc.paths["/listings/batch"]).toHaveProperty("post");
    expect(doc.paths["/listings/renew"]).toHaveProperty("post");
    expect(doc.paths["/listings/{externalRef}/status"]).toHaveProperty("post");
    expect(doc.paths["/listings/{externalRef}/images"]).toHaveProperty("put");
  });

  it("henter tallene fra INTEGRATION_LIMITS i stedet for å hardkode dem", () => {
    expect(doc["x-rate-limits"]).toEqual({
      readPerHour: INTEGRATION_LIMITS.apiKey.readPerHour,
      writePerHour: INTEGRATION_LIMITS.apiKey.writePerHour,
      batchPerHour: INTEGRATION_LIMITS.apiKey.batchPerHour,
      maxBatchRows: INTEGRATION_LIMITS.maxBatchRows,
      listingRenewalDays: INTEGRATION_LIMITS.listingRenewalDays,
      newListingsPerDayPerOrganization: INTEGRATION_LIMITS.organization.newListingsPerDay,
      newImagesPerDayPerOrganization: INTEGRATION_LIMITS.organization.newImagesPerDay,
    });

    const batchRowsSchema =
      doc.paths["/listings/batch"].post.requestBody.content["application/json"].schema.properties
        .rows;
    expect(batchRowsSchema.maxItems).toBe(INTEGRATION_LIMITS.maxBatchRows);
  });

  it("dokumenterer feilformatet og rategrense-headerne", () => {
    const errorSchema = doc.components.schemas.Error;
    expect(errorSchema.properties.error.properties).toHaveProperty("code");
    expect(errorSchema.properties.error.properties).toHaveProperty("message");
    expect(errorSchema.properties.error.properties).toHaveProperty("field");

    const rateLimited = doc.paths["/categories"].get.responses["429"];
    expect(rateLimited.headers).toHaveProperty("X-RateLimit-Limit");
    expect(rateLimited.headers).toHaveProperty("X-RateLimit-Remaining");
    expect(rateLimited.headers).toHaveProperty("X-RateLimit-Reset");
  });
});
