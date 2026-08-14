import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";

import { NativePageHeader } from "@/components/native-page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hapticNotification } from "@/lib/haptics";
import { ComposerErrorSummary } from "./composer-error-summary";

export function ListingComposerShell({
  title,
  pageKey,
  pageTitle,
  native,
  backLabel,
  onBack,
  onCancel,
  progress,
  notice,
  status,
  errorSummary,
  validationAttempt = 0,
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
  onCancel: () => void;
  progress?: ReactNode;
  notice?: ReactNode;
  status?: ReactNode;
  errorSummary?: string | null;
  validationAttempt?: number;
  children: ReactNode;
  footer: ReactNode;
  firstStep: boolean;
  contentClassName?: string;
}) {
  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousPageRef = useRef(pageKey);
  const [dismissedValidationAttempt, setDismissedValidationAttempt] = useState(0);
  const showValidationFeedback =
    native &&
    !!errorSummary &&
    validationAttempt > 0 &&
    validationAttempt !== dismissedValidationAttempt;

  useEffect(() => {
    if (previousPageRef.current === pageKey) return;
    previousPageRef.current = pageKey;
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => pageHeadingRef.current?.focus());
  }, [pageKey]);

  useEffect(() => {
    if (!native || validationAttempt === 0) return;
    void hapticNotification("error");
  }, [native, validationAttempt]);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-4">
      <NativePageHeader title={title} backLabel={backLabel} onBack={onBack} hideBack={native} />
      {!native && <h1 className="font-display text-3xl tracking-tight">{title}</h1>}
      {notice}

      {(progress || status) && (
        <div className="sticky top-0 z-10 -mx-4 mt-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          {progress}
          {status}
        </div>
      )}

      <ComposerErrorSummary message={errorSummary ?? null} />

      <div
        data-testid={`composer-page-${pageKey}`}
        aria-invalid={showValidationFeedback || undefined}
        className={cn(
          "mt-8 rounded-2xl pb-24",
          showValidationFeedback &&
            (validationAttempt % 2 === 0
              ? "composer-validation-error-even"
              : "composer-validation-error-odd"),
          contentClassName,
        )}
        onAnimationEndCapture={() => {
          setDismissedValidationAttempt(validationAttempt);
        }}
        onInputCapture={() => setDismissedValidationAttempt(validationAttempt)}
      >
        <h2 ref={pageHeadingRef} tabIndex={-1} className="sr-only">
          {pageTitle}
        </h2>
        {children}
      </div>

      <div
        className={cn(
          native
            ? "px-safe pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pt-3 backdrop-blur"
            : "flex flex-wrap items-center gap-3 border-t border-border pt-6",
          !native && (firstStep ? "justify-end" : "justify-between"),
        )}
      >
        {native ? (
          <div className="mx-auto grid w-full max-w-lg grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              className={cn("min-h-12 justify-self-start px-2", firstStep && "invisible")}
              aria-hidden={firstStep || undefined}
              tabIndex={firstStep ? -1 : undefined}
            >
              <ChevronLeft className="size-5" aria-hidden />
              Forrige
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onCancel}
              className="size-14 rounded-full"
              aria-label="Avbryt annonseopprettelse"
            >
              <X className="size-6" aria-hidden />
            </Button>
            <div className="min-w-0 justify-self-end">{footer}</div>
          </div>
        ) : (
          footer
        )}
      </div>
    </div>
  );
}
