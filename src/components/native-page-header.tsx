import { ChevronLeft } from "lucide-react";
import { useRouter, useNavigate } from "@tanstack/react-router";
import { useIsNative } from "@/lib/use-is-native";

interface NativePageHeaderProps {
  title: string;
  backLabel?: string;
  backTo?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  hideBack?: boolean;
}

export function NativePageHeader({
  title,
  backLabel = "Tilbake",
  backTo,
  right,
  onBack,
  hideBack,
}: NativePageHeaderProps) {
  const native = useIsNative();
  const router = useRouter();
  const navigate = useNavigate();

  if (!native) return null;

  const handleBack =
    onBack ?? (backTo ? () => void navigate({ to: backTo as never }) : () => router.history.back());

  return (
    <header className="pt-safe sticky top-0 z-30 flex items-center border-b border-border bg-background/95 backdrop-blur">
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
      <h1 className="flex-1 text-center text-base font-semibold">{title}</h1>
      <div className="flex h-12 min-w-[70px] items-center justify-end px-3">{right}</div>
    </header>
  );
}
