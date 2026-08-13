import { useEffect, useRef, type ReactNode } from "react";

import { NativePageHeader } from "@/components/native-page-header";
import { cn } from "@/lib/utils";

export function ListingComposerShell({
  title,
  pageKey,
  pageTitle,
  native,
  backLabel,
  onBack,
  progress,
  notice,
  status,
  children,
  footer,
  firstStep,
  contentClassName,
}: {
  title: string;
  pageKey: string;
  pageTitle: string;
  native: boolean;
  backLabel?: string;
  onBack: () => void;
  progress?: ReactNode;
  notice?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  firstStep: boolean;
  contentClassName?: string;
}) {
  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousPageRef = useRef(pageKey);

  useEffect(() => {
    if (previousPageRef.current === pageKey) return;
    previousPageRef.current = pageKey;
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => pageHeadingRef.current?.focus());
  }, [pageKey]);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-4">
      <NativePageHeader title={title} backLabel={backLabel} onBack={onBack} />
      {!native && <h1 className="font-display text-3xl tracking-tight">{title}</h1>}
      {notice}

      {(progress || status) && (
        <div className="sticky top-0 z-10 -mx-4 mt-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          {progress}
          {status}
        </div>
      )}

      <div
        data-testid={`composer-page-${pageKey}`}
        className={cn(
          "mt-8",
          native ? "pb-[calc(var(--app-bottom-nav-h)+6rem)]" : "pb-24",
          contentClassName,
        )}
      >
        <h2 ref={pageHeadingRef} tabIndex={-1} className="sr-only">
          {pageTitle}
        </h2>
        {children}
      </div>

      <div
        className={cn(
          native
            ? "px-safe fixed inset-x-0 bottom-[var(--app-bottom-nav-h)] left-[var(--app-nav-rail-w,0px)] z-40 border-t border-border bg-background/95 pt-3 pb-3 backdrop-blur"
            : "border-t border-border pt-6",
          "flex flex-wrap items-center gap-3",
          firstStep ? "justify-end" : "justify-between",
        )}
      >
        {footer}
      </div>
    </div>
  );
}
