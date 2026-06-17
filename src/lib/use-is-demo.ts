import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export function useIsDemo() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is-demo", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["demo", "admin"])
        .limit(1);
      if (error) return false;
      return (data ?? []).length > 0;
    },
  });
}
