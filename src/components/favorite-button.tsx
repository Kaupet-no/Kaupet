import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { hapticImpact } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { currentReturnTo } from "@/lib/auth-return";
import { savePendingAuthIntent, takePendingAuthIntent } from "@/lib/pending-auth-intent";
import { trackProductEvent } from "@/lib/product-analytics";

type Size = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, { btn: string; icon: string }> = {
  // `sm` ligger som overlegg på annonsekortets bilde, der en 44px sirkel blir
  // visuelt dominerende. Sirkelen forblir 32px; trykkflaten utvides usynlig til
  // 44px med et pseudoelement (before:-inset-1.5 → 32 + 2*6 = 44).
  sm: {
    btn: "relative size-8 before:absolute before:-inset-1.5 before:content-['']",
    icon: "size-4",
  },
  md: { btn: "size-10", icon: "size-5" },
  lg: { btn: "h-11 px-4 gap-2 w-full", icon: "size-5" },
};

export function FavoriteButton({
  listingId,
  size = "sm",
  variant = "icon",
  className,
  knownFavorite,
  favoriteStateReady = true,
}: {
  listingId: string;
  size?: Size;
  variant?: "icon" | "full";
  className?: string;
  /** Result lists provide batch-loaded state. Standalone buttons omit it and
   * use the single-listing fallback query below. */
  knownFavorite?: boolean;
  favoriteStateReady?: boolean;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: queriedFavorite = false, isFetched } = useQuery({
    queryKey: ["favorite", listingId, user?.id],
    enabled: !!user && knownFavorite === undefined,
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
  const isFavorite = knownFavorite ?? queriedFavorite;
  const isFavoriteReady = knownFavorite === undefined ? isFetched : favoriteStateReady;

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
      queryClient.setQueriesData<Set<string>>(
        { queryKey: ["listing-favorites", user?.id] },
        (current) => {
          const next = new Set(current ?? []);
          if (nowFav) next.add(listingId);
          else next.delete(listingId);
          return next;
        },
      );
      queryClient.invalidateQueries({ queryKey: ["favorite", listingId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["user-favorites"] });
      void hapticImpact("light");
      showSuccessToast(nowFav ? "Lagt til i favoritter" : "Fjernet fra favoritter");
      trackProductEvent("favorite_toggled", { favorite: nowFav });
    },
    onError: (e: Error) => {
      if (e.message !== "not-authenticated") {
        showErrorToast("Kunne ikke oppdatere favoritter");
      }
    },
  });

  const replayedIntent = useRef(false);
  useEffect(() => {
    if (!user || !isFavoriteReady || replayedIntent.current) return;
    if (!takePendingAuthIntent({ type: "favorite", listingId })) return;
    replayedIntent.current = true;
    if (!isFavorite) toggle.mutate();
  }, [isFavorite, isFavoriteReady, listingId, toggle, user]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      savePendingAuthIntent({ type: "favorite", listingId });
      navigate({
        to: "/auth",
        search: { mode: "signin", returnTo: currentReturnTo() },
      });
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
        disabled={toggle.isPending || (!!user && !isFavoriteReady)}
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
      disabled={toggle.isPending || (!!user && !isFavoriteReady)}
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
