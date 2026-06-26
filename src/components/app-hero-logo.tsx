import { useScrollFadeOpacity } from "@/lib/use-scroll-fade-opacity";
import { useKeyboardVisible } from "@/lib/use-keyboard-visible";

/** Large centered wordmark, fixed over the home hero, that fades out on scroll. */
export function AppHeroLogo() {
  const scrollOpacity = useScrollFadeOpacity();
  const keyboardVisible = useKeyboardVisible();
  const opacity = keyboardVisible ? 0 : scrollOpacity;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center"
      style={{
        top: "calc(env(safe-area-inset-top) + 3.5rem)",
        opacity,
        transition: "opacity 150ms ease",
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
