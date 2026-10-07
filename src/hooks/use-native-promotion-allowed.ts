import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsNative } from "@/hooks/use-is-native";

/**
 * Whether listing promotion (Vipps) entry points should be shown — the App
 * Store 3.1.1 kill switch. Always true on web; on native it's gated by
 * site_settings.native_promotion_enabled, so it can be turned off without a
 * new app build. Mirrors useDefaultSearchExamples's direct-read pattern —
 * site_settings is readable by anyone via RLS. Native purchases require an
 * explicit enabled value; loading, missing settings and errors block them.
 */
export function useNativePromotionAllowed(): boolean {
  const native = useIsNative();
  const { data, isError } = useQuery({
    queryKey: ["site-settings", "native-promotion-enabled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("native_promotion_enabled")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data?.native_promotion_enabled === true;
    },
    enabled: native,
    staleTime: 5 * 60 * 1000,
  });
  return !native || (data === true && !isError);
}
