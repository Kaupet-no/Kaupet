import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ListChecks, Loader2, ShoppingBag, Star } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "@/components/star-rating";
import { getMyProfileStats } from "@/lib/reviews.functions";

export function StatCell({
  label,
  value,
  icon,
  children,
}: {
  label: string;
  value?: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-5 text-center">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon} {label}
      </span>
      <div className="flex min-h-7 items-center justify-center">
        {value !== undefined ? (
          <span className="text-xl font-semibold tabular-nums">{value}</span>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function ProfileStats() {
  const getStats = useServerFn(getMyProfileStats);
  const { data: stats, isLoading } = useQuery({
    queryKey: ["my-profile-stats"],
    queryFn: () => getStats({}),
  });

  if (isLoading || !stats) {
    return (
      <Card>
        <CardContent className="grid grid-cols-3 divide-x divide-border p-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="grid grid-cols-3 divide-x divide-border p-0">
        <StatCell label="Annonser" icon={<ListChecks className="size-3.5" />}>
          {stats.listings_count > 0 ? (
            <span className="text-xl font-semibold tabular-nums">
              {stats.listings_count.toLocaleString("nb-NO")}
            </span>
          ) : (
            <Link
              to="/ny-annonse"
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Opprett din første
            </Link>
          )}
        </StatCell>
        <StatCell label="Salg" icon={<ShoppingBag className="size-3.5" />}>
          {stats.sales_count > 0 ? (
            <span className="text-xl font-semibold tabular-nums">
              {stats.sales_count.toLocaleString("nb-NO")}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Ingen ennå</span>
          )}
        </StatCell>
        <StatCell label="Vurdering" icon={<Star className="size-3.5" />}>
          {stats.review_count > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-semibold tabular-nums">
                {stats.avg_rating.toFixed(1)}
              </span>
              <StarRating value={stats.avg_rating} readOnly size={14} />
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Ingen ennå</span>
          )}
        </StatCell>
      </CardContent>
    </Card>
  );
}
