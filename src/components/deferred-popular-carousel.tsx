import { lazy, Suspense, useEffect, useRef, useState } from "react";

import type { PopularCarouselProps } from "./popular-carousel";

const LazyPopularCarousel = lazy(() =>
  import("./popular-carousel").then((module) => ({ default: module.PopularCarousel })),
);

export function DeferredPopularCarousel(props: PopularCarouselProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (typeof IntersectionObserver === "undefined") {
      const timeout = setTimeout(() => setNearViewport(true), 0);
      return () => clearTimeout(timeout);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -200px 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={sectionRef}>
      {nearViewport ? (
        <Suspense
          fallback={<PopularCarouselFallback hasPopularitySignal={props.hasPopularitySignal} />}
        >
          <LazyPopularCarousel {...props} />
        </Suspense>
      ) : (
        <PopularCarouselFallback hasPopularitySignal={props.hasPopularitySignal} />
      )}
    </div>
  );
}

function PopularCarouselFallback({
  hasPopularitySignal,
}: Pick<PopularCarouselProps, "hasPopularitySignal">) {
  return (
    <div aria-busy="true">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="font-display text-2xl tracking-tight">
          {hasPopularitySignal ? "Populært akkurat nå" : "Nye annonser"}
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-3">
            <div className="aspect-[4/3] w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
