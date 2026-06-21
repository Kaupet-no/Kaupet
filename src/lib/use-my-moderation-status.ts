import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";

export type ModerationStatus = {
  is_banned: boolean;
  ban_reason: string | null;
  is_suspended: boolean;
  suspension_reason: string | null;
  suspension_expires_at: string | null;
};

export function useMyModerationStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-moderation-status", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<ModerationStatus | null> => {
      if (!user) return null;
      const { data, error } = await supabase.rpc("my_moderation_status");
      if (error) return null;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as ModerationStatus) ?? null;
    },
  });
}
