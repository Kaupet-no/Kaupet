import { z } from "zod";

// Kun feil — ikke atferd. Se personvern.tsx, «Bruksstatistikk».
export const productEventNames = ["listing_publish_failed"] as const;

const forbiddenPropertyKeys = new Set([
  "address",
  "coordinates",
  "email",
  "lat",
  "latitude",
  "listingid",
  "lng",
  "location",
  "longitude",
  "q",
  "query",
  "savedsearchid",
  "text",
  "userid",
]);

const propertyValueSchema = z.union([
  z.string().max(80),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const propertiesSchema = z
  .record(z.string().max(40), propertyValueSchema)
  .superRefine((properties, context) => {
    for (const key of Object.keys(properties)) {
      if (forbiddenPropertyKeys.has(key.replaceAll("_", "").toLowerCase())) {
        context.addIssue({ code: "custom", path: [key], message: "Property is not privacy-safe" });
      }
    }
  });

export const productEventSchema = z.object({
  eventName: z.enum(productEventNames),
  platform: z.enum(["web", "ios", "android"]),
  path: z.string().startsWith("/").max(160),
  properties: propertiesSchema.default({}),
});

export type ProductEventName = (typeof productEventNames)[number];
export type ProductEventProperties = Record<string, string | number | boolean | null>;
