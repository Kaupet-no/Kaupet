import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Brukerens roller fra `user_roles`, hentet én gang. `useIsAdmin`/
 * `useIsModerator`/`useIsDemo` er `select`-avledninger over samme queryKey,
 * så react-query deduper dem til én spørring uansett hvor mange av dem en
 * side kaller. Legg nye rollesjekker til her, ikke som egne spørringer.
 */
function useRoleFlag<T>(select: (roles: string[]) => T) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-roles", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<string[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (error) return [];
      return (data ?? []).map((row) => row.role as string);
    },
    select,
  });
}

export function useIsAdmin() {
  return useRoleFlag((roles) => roles.includes("admin"));
}

export function useIsModerator() {
  return useRoleFlag((roles) => roles.includes("moderator"));
}

/** Demobrukere og administratorer deler de samme testflatene. */
export function useIsDemo() {
  return useRoleFlag((roles) => roles.includes("demo") || roles.includes("admin"));
}
