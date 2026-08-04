import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder for `/bruker/$id`, shown via the route's
 * `pendingComponent` while the loader resolves — matches the page's
 * header + listing grid shape so there's no layout shift once real content
 * lands. */
export function ProfilePageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Laster brukerprofil…</span>
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
