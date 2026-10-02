import { useKeyboardVisible } from "@/hooks/use-keyboard-visible";

/**
 * Large centered wordmark in the home flow. Hidden while the keyboard is up so
 * the focused search field and its suggestions own the screen; the logo
 * wrapper in app-landing.tsx owns the pin-and-scroll-away movement of the
 * logo itself.
 */
export function AppHeroLogo() {
  const keyboardVisible = useKeyboardVisible();

  return (
    <div
      className="relative z-30 flex justify-center pb-2"
      style={{
        opacity: keyboardVisible ? 0 : 1,
        transition: "opacity 150ms ease",
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
