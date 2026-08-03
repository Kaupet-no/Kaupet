import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { VehicleBrandGroup } from "@/lib/category-filters";

export type VehicleBrand = { id: string; name: string; category_group: VehicleBrandGroup };
export type VehicleModelClass = { id: string; brand_id: string; name: string };
export type VehicleModel = { id: string; brand_id: string; name: string; class_id: string | null };

/** Fetches all vehicle brands once; cached across the app, filtered client-side by group. */
export function useAllVehicleBrands() {
  return useQuery({
    queryKey: ["vehicle-brands", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_brands")
        .select("id, name, category_group")
        .eq("status", "approved")
        .order("name");
      if (error) throw error;
      return (data ?? []) as VehicleBrand[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetches all vehicle models once; cached across the app, filtered client-side by brand_id. */
export function useAllVehicleModels() {
  return useQuery({
    queryKey: ["vehicle-models", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_models")
        .select("id, brand_id, name, class_id")
        .eq("status", "approved")
        .order("name");
      if (error) throw error;
      return (data ?? []) as VehicleModel[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetches all vehicle model classes once; cached across the app, filtered client-side by brand_id. Most brands have none. */
export function useAllVehicleModelClasses() {
  return useQuery({
    queryKey: ["vehicle-model-classes", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_model_classes")
        .select("id, brand_id, name")
        .eq("status", "approved")
        .order("name");
      if (error) throw error;
      return (data ?? []) as VehicleModelClass[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
