import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import type { VehicleBrandGroup } from "@/lib/category-filters";

export type VehicleBrand = { id: string; name: string; category_group: VehicleBrandGroup };
export type VehicleModelClass = { id: string; brand_id: string; name: string };
export type VehicleModel = { id: string; brand_id: string; name: string; class_id: string | null };

/** Referansetabellene passerte PostgRESTs radgrense på 1000 da
 * vehicle_models vokste, og en vanlig `.select()` mistet da alfabetisk sene
 * modeller (f.eks. Volvo «XC60») uten feil. */
async function fetchAllApproved<T>(
  table: "vehicle_brands" | "vehicle_models" | "vehicle_model_classes",
  select: string,
): Promise<T[]> {
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from(table)
      .select(select)
      .eq("status", "approved")
      .order("name")
      .order("id")
      .range(from, to),
  );
  if (error) throw error;
  return data as T[];
}

/** Delt konfigurasjon, slik at en kallsted som må ha merkene NÅ (f.eks.
 * søke-submit på forsiden) kan hente dem via queryClient.ensureQueryData og
 * treffe nøyaktig samme cache som hooken. */
export const allVehicleBrandsQueryOptions = {
  queryKey: ["vehicle-brands", "all"] as const,
  queryFn: () => fetchAllApproved<VehicleBrand>("vehicle_brands", "id, name, category_group"),
  staleTime: 5 * 60 * 1000,
};

/** Fetches all vehicle brands once; cached across the app, filtered client-side by group.
 * `enabled` (default `true`) lets callers defer the fetch — e.g. the landing
 * page only needs brands once the user shows search intent. */
export function useAllVehicleBrands(enabled = true) {
  return useQuery({ ...allVehicleBrandsQueryOptions, enabled });
}

/** Fetches all vehicle models once; cached across the app, filtered client-side by brand_id. */
export function useAllVehicleModels() {
  return useQuery({
    queryKey: ["vehicle-models", "all"],
    queryFn: () => fetchAllApproved<VehicleModel>("vehicle_models", "id, brand_id, name, class_id"),
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetches all vehicle model classes once; cached across the app, filtered client-side by brand_id. Most brands have none. */
export function useAllVehicleModelClasses() {
  return useQuery({
    queryKey: ["vehicle-model-classes", "all"],
    queryFn: () =>
      fetchAllApproved<VehicleModelClass>("vehicle_model_classes", "id, brand_id, name"),
    staleTime: 5 * 60 * 1000,
  });
}
