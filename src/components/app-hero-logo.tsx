import { useScrollFadeOpacity } from "@/lib/use-scroll-fade-opacity";

/** Large centered wordmark, fixed over the home hero, that fades out on scroll. */
export function AppHeroLogo() {
  const opacity = useScrollFadeOpacity();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center"
      style={{
        top: "calc(env(safe-area-inset-top) + 3.5rem)",
        opacity,
        pointerEvents: opacity < 0.05 ? "none" : "auto",
      }}
    >
      <span className="flex items-baseline gap-1">
        <span className="font-display text-4xl font-semibold tracking-tight text-primary">
          kaupet
        </span>
        <span className="font-display text-4xl text-accent">.</span>
        <span className="font-display text-3xl text-muted-foreground">no</span>
      </span>
    </div>
  );
}
