/** Loading placeholder for `/annonser` shown until client-side state
 * (`mounted`) settles — matches the page's post-mount grid shape (card grid
 * + sticky map sidebar) so there's no layout shift once real content lands. */
export function BrowsePageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10" aria-busy="true" aria-live="polite">
      <h1 className="font-display text-3xl tracking-tight">Annonser</h1>
      <span className="sr-only">Laster…</span>
      <div className="mt-6 h-14 w-full animate-pulse rounded-full bg-muted" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border p-3">
              <div className="aspect-[4/3] w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="hidden lg:block">
          <div className="sticky top-24 h-[calc(100vh-8rem)] w-full animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    </div>
  );
}
