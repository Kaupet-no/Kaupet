import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder for `/$kaupetCode` (listing detail), shown via the
 * route's `pendingComponent` while the loader resolves — matches the page's
 * two-column layout (gallery + sidebar) so there's no layout shift once real
 * content lands. */
export function ListingDetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Laster annonse…</span>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          <div className="mt-4 space-y-3">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
