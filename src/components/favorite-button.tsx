import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { hapticImpact, hapticNotification } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, { btn: string; icon: string }> = {
  sm: { btn: "size-8", icon: "size-4" },
  md: { btn: "size-10", icon: "size-5" },
  lg: { btn: "h-11 px-4 gap-2 w-full", icon: "size-5" },
};

export function FavoriteButton({
  listingId,
  size = "sm",
  variant = "icon",
  className,
}: {
  listingId: string;
  size?: Size;
  variant?: "icon" | "full";
  className?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: isFavorite = false } = useQuery({
    queryKey: ["favorite", listingId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select("listing_id")
        .eq("listing_id", listingId)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const toggle = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("not-authenticated");
      if (isFavorite) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("listing_id", listingId)
          .eq("user_id", user.id);
        if (error) throw error;
        return false;
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ listing_id: listingId, user_id: user.id });
        if (error) throw error;
        return true;
      }
    },
    onSuccess: (nowFav) => {
      queryClient.invalidateQueries({ queryKey: ["favorite", listingId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["user-favorites"] });
      void hapticImpact("light");
      toast.success(nowFav ? "Lagt til i favoritter" : "Fjernet fra favoritter");
    },
    onError: (e: Error) => {
      if (e.message !== "not-authenticated") {
        void hapticNotification("error");
        toast.error("Kunne ikke oppdatere favoritter");
      }
    },
  });

  if (!user) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      navigate({ to: "/auth", search: { mode: "signin" } });
      return;
    }
    toggle.mutate();
  };

  const sizing = SIZE_CLASSES[size];

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={toggle.isPending}
        className={cn(
          "inline-flex items-center justify-center rounded-md border border-border bg-card text-sm font-medium transition hover:bg-accent/10",
          sizing.btn,
          isFavorite && "border-accent/40 bg-accent/10 text-accent",
          className,
        )}
        aria-pressed={isFavorite}
        aria-label={isFavorite ? "Fjern fra favoritter" : "Lagre som favoritt"}
      >
        <Heart className={cn(sizing.icon, isFavorite && "fill-accent text-accent")} />
        {isFavorite ? "Lagret som favoritt" : "Lagre som favoritt"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={toggle.isPending}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur transition hover:bg-background",
        sizing.btn,
        className,
      )}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? "Fjern fra favoritter" : "Lagre som favoritt"}
    >
      <Heart
        className={cn(sizing.icon, isFavorite ? "fill-accent text-accent" : "text-foreground")}
      />
    </button>
  );
}
