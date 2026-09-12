import { useScrollFadeOpacity } from "@/hooks/use-scroll-fade-opacity";
import { useKeyboardVisible } from "@/hooks/use-keyboard-visible";

// Hero er nå en full first-screen-seksjon (min-h-[100dvh]), så logoen skal
// først fade helt ut lenger ned enn den forrige, korte hero-høyden ga rom
// for. 320px er en pragmatisk konstant tilpasset den nye seksjonshøyden;
// hooken selv kjenner ikke til layouten og tar fortsatt fadeDistance som
// parameter fra kallstedet.
const HERO_FADE_DISTANCE = 320;

/** Large centered wordmark in the home flow, fading out as the user scrolls. */
export function AppHeroLogo() {
  const scrollOpacity = useScrollFadeOpacity(HERO_FADE_DISTANCE);
  const keyboardVisible = useKeyboardVisible();
  const opacity = keyboardVisible ? 0 : scrollOpacity;

  return (
    <div
      className="relative z-30 flex justify-center pb-2"
      style={{
        opacity,
        transition: "opacity 150ms ease",
        pointerEvents: opacity < 0.05 ? "none" : "auto",
      }}
    >
      <span className="flex items-baseline gap-1">
        <span className="font-display text-3xl font-semibold tracking-tight text-primary">
          kaupet
        </span>
        <span className="font-display text-3xl text-brand">.</span>
        <span className="font-display text-2xl text-muted-foreground">no</span>
      </span>
    </div>
  );
}
