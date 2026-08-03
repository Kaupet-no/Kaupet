import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { VehicleBrandGroup } from "@/lib/category-filters";

export type VehicleBrand = { id: string; name: string; category_group: VehicleBrandGroup };
export type VehicleModelClass = { id: string; brand_id: string; name: string };
export type VehicleModel = { id: string; brand_id: string; name: string; class_id: string | null };

const PAGE_SIZE = 1000;

/** PostgREST caps any single response at the project's max-rows setting
 * (1000 by default) regardless of an explicit higher .limit() — a plain
 * `.select()` on these reference tables silently truncated past that once
 * vehicle_models grew beyond 1000 approved rows, dropping every
 * alphabetically-late model (e.g. Volvo's "XC60") from the dropdowns with no
 * error. Pages through with .range() until a page comes back short. */
async function fetchAllPages<T>(
  table: "vehicle_brands" | "vehicle_models" | "vehicle_model_classes",
  select: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq("status", "approved")
      .order("name")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Fetches all vehicle brands once; cached across the app, filtered client-side by group. */
export function useAllVehicleBrands() {
  return useQuery({
    queryKey: ["vehicle-brands", "all"],
    queryFn: () => fetchAllPages<VehicleBrand>("vehicle_brands", "id, name, category_group"),
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetches all vehicle models once; cached across the app, filtered client-side by brand_id. */
export function useAllVehicleModels() {
  return useQuery({
    queryKey: ["vehicle-models", "all"],
    queryFn: () => fetchAllPages<VehicleModel>("vehicle_models", "id, brand_id, name, class_id"),
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetches all vehicle model classes once; cached across the app, filtered client-side by brand_id. Most brands have none. */
export function useAllVehicleModelClasses() {
  return useQuery({
    queryKey: ["vehicle-model-classes", "all"],
    queryFn: () => fetchAllPages<VehicleModelClass>("vehicle_model_classes", "id, brand_id, name"),
    staleTime: 5 * 60 * 1000,
  });
}
