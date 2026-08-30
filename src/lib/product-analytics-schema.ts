import { z } from "zod";

export const productEventNames = [
  "auth_started",
  "auth_completed",
  "search_opened",
  "search_submitted",
  "search_zero_results",
  "search_page_viewed",
  "search_filter_opened",
  "search_filter_applied",
  "search_filter_cancelled",
  "search_suggestion_selected",
  "search_zero_results_recovered",
  "search_map_opened",
  "search_saved",
  "search_result_opened",
  "listing_opened",
  "contact_started",
  "favorite_toggled",
  "listing_creation_started",
  "listing_creation_step_completed",
  "listing_published",
  "onboarding_completed",
] as const;

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
