import { useScrollFadeOpacity } from "@/hooks/use-scroll-fade-opacity";
import { useKeyboardVisible } from "@/hooks/use-keyboard-visible";

/** Large centered wordmark in the home flow, fading out as the user scrolls. */
export function AppHeroLogo() {
  const scrollOpacity = useScrollFadeOpacity();
  const keyboardVisible = useKeyboardVisible();
  const opacity = keyboardVisible ? 0 : scrollOpacity;

  return (
    <div
      className="pointer-events-none relative z-30 flex justify-center pb-4 pt-safe"
      style={{
        opacity,
        transition: "opacity 150ms ease",
        pointerEvents: opacity < 0.05 ? "none" : "auto",
      }}
    >
      <span className="flex items-baseline gap-1">
        <span className="font-display text-4xl font-semibold tracking-tight text-primary">
          kaupet
        </span>
        <span className="font-display text-4xl text-brand">.</span>
        <span className="font-display text-3xl text-muted-foreground">no</span>
      </span>
    </div>
  );
}
