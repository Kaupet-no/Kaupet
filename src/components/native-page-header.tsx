import { ChevronLeft } from "lucide-react";
import { useRouter, useNavigate } from "@tanstack/react-router";
import { useIsNative } from "@/hooks/use-is-native";
import { useScrollFadeOpacity } from "@/hooks/use-scroll-fade-opacity";

interface NativePageHeaderProps {
  title: string;
  backLabel?: string;
  backTo?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  hideBack?: boolean;
  /**
   * For sider som viser samme tittel som en stor `<h1>` i innholdet:
   * headertittelen er skjult i toppen og toner inn først når innholdstittelen
   * er scrollet vekk, i stedet for å stå duplisert rett over den.
   */
  titleFadesIn?: boolean;
}

export function NativePageHeader({
  title,
  backLabel = "Tilbake",
  backTo,
  right,
  onBack,
  hideBack,
  titleFadesIn,
}: NativePageHeaderProps) {
  const native = useIsNative();
  const contentTitleOpacity = useScrollFadeOpacity();
  const router = useRouter();
  const navigate = useNavigate();

  if (!native) return null;

  const handleBack =
    onBack ?? (backTo ? () => void navigate({ to: backTo as never }) : () => router.history.back());

  return (
    // pl-safe/pr-safe: i landskap ligger notchen på siden, og headeren har ingen
    // egen horisontal padding — uten dette havner Tilbake-knappen under den.
    <header className="pt-safe pl-safe pr-safe sticky top-0 z-30 flex items-center border-b border-border bg-background/95 backdrop-blur">
      {!hideBack ? (
        <button
          type="button"
          onClick={handleBack}
          className="flex h-12 items-center gap-1 px-3 text-primary"
          aria-label="Tilbake"
        >
          <ChevronLeft className="size-6" />
          <span className="text-sm">{backLabel}</span>
        </button>
      ) : (
        <div className="flex h-12 min-w-[70px] items-center px-3" />
      )}
      {/* line-clamp-1: uten den vokser headeren på lange titler og Tilbake-
          knappen havner ute av lodd — verre i landskap, der pl-safe/pr-safe
          også spiser bredde. */}
      <h1
        className="line-clamp-1 flex-1 text-center text-base font-semibold transition-opacity"
        style={titleFadesIn ? { opacity: 1 - contentTitleOpacity } : undefined}
        aria-hidden={titleFadesIn || undefined}
      >
        {title}
      </h1>
      <div className="flex h-12 min-w-[70px] items-center justify-end px-3">{right}</div>
    </header>
  );
}
