import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const coordinates = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  })
  .strict();

async function limitGeocoding() {
  const { assertNotRateLimited } = await import("@/lib/rate-limit.server");
  await assertNotRateLimited("geocoding", 60, 60);
}

export const searchPlacesFn = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        query: z.string().trim().min(2).max(100),
        limit: z.number().int().min(1).max(10).default(6),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }) => {
    await limitGeocoding();
    const { searchPlaces } = await import("@/lib/geocode.server");
    return searchPlaces(data.query, data.limit);
  });

export const lookupPostalCodeFn = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        postal: z
          .string()
          .trim()
          .regex(/^\d{4}$/),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }) => {
    await limitGeocoding();
    const { lookupPostalCode } = await import("@/lib/geocode.server");
    return lookupPostalCode(data.postal);
  });

export const reverseGeocodeAddressFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => coordinates.parse(input))
  .handler(async ({ data }) => {
    await limitGeocoding();
    const { reverseGeocodeAddress } = await import("@/lib/geocode.server");
    return reverseGeocodeAddress(data);
  });

export const geocodeNorwayAddressFn = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        postal_code: z
          .string()
          .trim()
          .regex(/^\d{4}$/)
          .nullish(),
        city: z.string().trim().max(100).nullish(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }) => {
    await limitGeocoding();
    const { geocodeNorwayAddress } = await import("@/lib/geocode.server");
    return geocodeNorwayAddress(data);
  });

export const geocodeStreetAddressFn = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        address_line: z.string().trim().min(1).max(200),
        postal_code: z
          .string()
          .trim()
          .regex(/^\d{4}$/),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }) => {
    await limitGeocoding();
    const { geocodeStreetAddress } = await import("@/lib/geocode.server");
    return geocodeStreetAddress(data);
  });
