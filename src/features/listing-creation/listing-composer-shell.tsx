import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";

import { NativePageHeader } from "@/components/native-page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hapticNotification, hapticSelection } from "@/lib/haptics";
import { ComposerErrorSummary } from "./composer-error-summary";

export function ListingComposerShell({
  title,
  onTitleChange,
  categoryLabel,
  onEditCategory,
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
  /** Annonsens egen tittel, oppgitt på landingsskjermen — vist gjennom hele
   * wizarden så brukeren ser hva de holder på med, i stedet for et eget
   * tittelsteg midt i flyten (se applyLandingEntry i category-flows.ts). */
  title: string;
  /** When set, the title is editable inline (click to edit, save on
   * blur/Enter). Left undefined for vehicle listings, whose title is
   * generated from Årsmodell/Merke/Modell (see computeVehicleTitle). */
  onTitleChange?: (value: string) => void;
  /** Bekreftet kategori, vist som en klikkbar chip under tittelen. */
  categoryLabel?: string;
  /** When set, the category chip becomes clickable (web only) — used by the
   * intent+title flow to let the user change a category they've already
   * confirmed, via a confirmation dialog + the manual picker sheet, rather
   * than through ordinary step navigation. */
  onEditCategory?: () => void;
  pageKey: string;
  pageTitle: string;
  native: boolean;
  backLabel?: string;
  onBack?: () => void;
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const focusFrameRef = useRef<number | null>(null);
  const previousPageRef = useRef(pageKey);
  const [dismissedValidationAttempt, setDismissedValidationAttempt] = useState(0);
  const showValidationFeedback =
    native &&
    !!errorSummary &&
    validationAttempt > 0 &&
    validationAttempt !== dismissedValidationAttempt;

  const ensureFocusedFieldVisible = useCallback(() => {
    if (!native) return;
    if (focusFrameRef.current !== null) cancelAnimationFrame(focusFrameRef.current);
    focusFrameRef.current = requestAnimationFrame(() => {
      focusFrameRef.current = null;
      const field = document.activeElement;
      const container = scrollContainerRef.current;
      if (
        !(field instanceof HTMLElement) ||
        !container?.contains(field) ||
        !field.matches("input, textarea, select, [contenteditable='true']")
      )
        return;
      field.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
    });
  }, [native]);

  useEffect(() => {
    if (previousPageRef.current === pageKey) return;
    previousPageRef.current = pageKey;
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => pageHeadingRef.current?.focus());
    if (native) void hapticSelection();
  }, [native, pageKey]);

  useEffect(() => {
    if (!native) return;
    const viewport = window.visualViewport;
    const container = scrollContainerRef.current;
    container?.addEventListener("focusin", ensureFocusedFieldVisible);
    viewport?.addEventListener("resize", ensureFocusedFieldVisible);
    ensureFocusedFieldVisible();
    return () => {
      container?.removeEventListener("focusin", ensureFocusedFieldVisible);
      viewport?.removeEventListener("resize", ensureFocusedFieldVisible);
      if (focusFrameRef.current !== null) cancelAnimationFrame(focusFrameRef.current);
    };
  }, [ensureFocusedFieldVisible, native, pageKey]);

  useEffect(() => {
    if (!native || validationAttempt === 0) return;
    void hapticNotification("error");
  }, [native, validationAttempt]);

  return (
    <div
      className={cn(
        "mx-auto max-w-3xl px-4 pt-6 pb-4",
        native && "native-composer-shell flex flex-col",
      )}
    >
      <NativePageHeader
        title={title || "Ny annonse"}
        backLabel={backLabel}
        onBack={onBack}
        hideBack={native}
      />
      {!native && <ComposerHeading title={title} onTitleChange={onTitleChange} />}
      {categoryLabel && (
        <p className="mt-1 text-sm text-muted-foreground">
          {onEditCategory ? (
            <button
              type="button"
              onClick={onEditCategory}
              className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              {categoryLabel}
            </button>
          ) : (
            categoryLabel
          )}
        </p>
      )}
      {notice}

      {(progress || status) && (
        <div className="sticky top-0 z-10 -mx-4 mt-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          {progress}
          {status}
        </div>
      )}

      <ComposerErrorSummary message={errorSummary ?? null} />

      <div
        ref={scrollContainerRef}
        data-composer-scroll={native || undefined}
        data-testid={`composer-page-${pageKey}`}
        aria-invalid={showValidationFeedback || undefined}
        className={cn(
          "mt-8 rounded-2xl pb-24",
          native &&
            "native-composer-card overflow-y-auto overscroll-contain border border-border bg-card",
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
        data-composer-footer={native ? "native" : "web"}
        className={cn(
          "[&_button]:min-h-12 [&_button]:min-w-12",
          native
            ? "px-safe pb-safe shrink-0 border-t border-border bg-background/95 pt-3 backdrop-blur"
            : "sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:z-auto md:mx-0 md:bg-transparent md:px-0 md:pb-0 md:pt-6 md:backdrop-blur-none",
          !native && (firstStep ? "justify-end" : "justify-between"),
        )}
      >
        {native ? (
          <div className="mx-auto grid w-full max-w-lg grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              className={cn(
                "min-h-12 justify-self-start px-2",
                (firstStep || !onBack) && "invisible",
              )}
              aria-hidden={firstStep || !onBack || undefined}
              tabIndex={firstStep || !onBack ? -1 : undefined}
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

/**
 * Annonsetittelen i wizard-headeren. Klikkbar når `onTitleChange` er satt:
 * tittelen ble oppgitt på landingsskjermen, og dette er stedet den rettes —
 * wizarden har ikke lenger noe eget tittelsteg. Er den ikke redigerbar
 * (kjøretøy, der tittelen genereres av Årsmodell/Merke/Modell) vises den som
 * ren tekst.
 */
function ComposerHeading({
  title,
  onTitleChange,
}: {
  title: string;
  onTitleChange?: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const className = "font-display text-3xl tracking-tight";

  if (editing && onTitleChange) {
    const commit = () => {
      onTitleChange(draft.trim());
      setEditing(false);
    };
    return (
      <input
        autoFocus
        aria-label="Annonsetittel"
        value={draft}
        maxLength={120}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(title);
            setEditing(false);
          }
        }}
        className={cn(className, "w-full border-b border-border bg-transparent outline-none")}
      />
    );
  }

  return (
    <h1 className={className}>
      {onTitleChange ? (
        <button
          type="button"
          onClick={() => {
            setDraft(title);
            setEditing(true);
          }}
          className="text-left underline decoration-dotted underline-offset-4 hover:decoration-solid"
          title="Endre tittel"
        >
          {title || "Ny annonse"}
        </button>
      ) : (
        title || "Ny annonse"
      )}
    </h1>
  );
}
