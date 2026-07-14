import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";

export function useIsModerator() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is-moderator", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "moderator")
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
  });
}

export function useIsAdminOrModerator(
  isAdmin: boolean | undefined,
  isModerator: boolean | undefined,
) {
  return !!(isAdmin || isModerator);
}
