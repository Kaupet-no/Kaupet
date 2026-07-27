import type { VehicleLookupResult } from "@/lib/vehicle/vehicle-lookup.server";

/** `attributes.vehicle_lookup` is stored as a JSON string (see
 * `use-vehicle-lookup-flow.ts`'s `JSON.stringify(lookup)`), not an object —
 * parse it back out here rather than casting the raw string. Client-safe
 * (unlike `vehicle-lookup.server.ts`, which only exports server-only code
 * plus the `VehicleLookupResult` type), so both the listing detail view and
 * the route that builds its seller-contact slot can share this. */
export function parseVehicleLookup(raw: unknown): VehicleLookupResult | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as VehicleLookupResult;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as VehicleLookupResult;
    } catch {
      return null;
    }
  }
  return null;
}
