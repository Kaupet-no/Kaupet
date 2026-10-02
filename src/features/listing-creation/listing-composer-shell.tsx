import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { ChevronLeft, Eye, X } from "lucide-react";

import { NativePageHeader } from "@/components/native-page-header";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  challenge,
  footer,
  firstStep,
  contentClassName,
  preview,
  previewLabel = "Slik ser kjøperen annonsen",
  previewSection,
  strength,
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
  challenge?: ReactNode;
  footer: ReactNode;
  firstStep: boolean;
  contentClassName?: string;
  /** Annonsesiden slik kjøperen ser den på mobil. Kun desktop-web: står fast i
   * en telefonramme ved siden av skjemaet fra 1100 px, og åpnes fra
   * «Forhåndsvis» i stegraden som et panel fra høyre under det — rammen og
   * et skjema på 36 rem får ikke plass side om side smalere enn det. */
  preview?: ReactNode;
  /** Overskrift over forhåndsvisningen — Ønskes kjøpt leses av selgere, ikke kjøpere. */
  previewLabel?: string;
  /** Delen av annonsesiden steget redigerer (`data-preview-section`) —
   * telefonrammen scroller dit når steget byttes. */
  previewSection?: string;
  /** Annonsestyrken, vist i stegraden ved siden av «Forhåndsvis». Kun desktop-web. */
  strength?: ReactNode;
}) {
  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const focusFrameRef = useRef<number | null>(null);
  const previousPageRef = useRef(pageKey);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const lastEditAtRef = useRef(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Native: når kortet er scrollet flytter fremdriftsviseren opp i headeren
  // (i stedet for tittelen), så lave skjermer får mer plass til skjemaet.
  const [scrolled, setScrolled] = useState(false);
  const progressInHeader = native && scrolled && !!progress;
  const [dismissedValidationAttempt, setDismissedValidationAttempt] = useState(0);
  const showValidationFeedback =
    native &&
    !!errorSummary &&
    validationAttempt > 0 &&
    validationAttempt !== dismissedValidationAttempt;
  const showToolbar = !native && !!(preview || strength);
  const showPreview = !native && !!preview;

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
    const pageChanged = previousPageRef.current !== pageKey;
    previousPageRef.current = pageKey;
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => pageHeadingRef.current?.focus());
    if (native && pageChanged) void hapticSelection();
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

  // Scroller telefonrammen (ikke siden) til delen av annonsen steget
  // redigerer. Rammen er display:none under 1100 px — da er alle mål 0 og
  // scrollTo gjør ingenting.
  useEffect(() => {
    lastEditAtRef.current = 0;
    const frame = previewFrameRef.current;
    if (!frame || !previewSection) return;
    const target = frame.querySelector<HTMLElement>(`[data-preview-section="${previewSection}"]`);
    if (target) scrollPreviewFrame(frame, target, "start");
  }, [previewSection, pageKey]);

  // Et steg kan redigere flere deler av annonsen (f.eks. pris og frakt), så
  // rammen følger det som faktisk endres i forhåndsvisningen rett etter at
  // brukeren har redigert skjemaet — ikke bare delen steget starter på.
  useEffect(() => {
    const frame = previewFrameRef.current;
    if (!frame) return;
    const observer = new MutationObserver((records) => {
      if (performance.now() - lastEditAtRef.current > 1000) return;
      for (const record of records) {
        const node = record.addedNodes[0] ?? record.target;
        const target = node instanceof HTMLElement ? node : node.parentElement;
        // Bunnlinjen (pris + «Send melding») står alltid synlig.
        if (!target || !frame.contains(target) || target.closest("[data-preview-sticky-bottom]"))
          continue;
        const rect = target.getBoundingClientRect();
        // Skjult (rammen under 1100 px, eller en skjult del av annonsen).
        if (rect.width === 0 && rect.height === 0) continue;
        scrollPreviewFrame(frame, target, "nearest");
        return;
      }
    });
    observer.observe(frame, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [showPreview]);

  useEffect(() => {
    if (!native || validationAttempt === 0) return;
    void hapticNotification("error");
  }, [native, validationAttempt]);

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1120px] px-4 pt-6 pb-4",
        native && "native-composer-shell flex flex-col",
      )}
    >
      {!native && (
        <div className="sticky top-0 z-40 -mx-4 -mt-6 mb-4 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-4 pt-safe backdrop-blur">
          {onBack && !firstStep && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="-ml-2 shrink-0 lg:hidden"
              aria-label={backLabel || "Tilbake"}
            >
              <ChevronLeft className="size-5" aria-hidden />
            </Button>
          )}
          <span className="flex shrink-0 items-baseline gap-0.5">
            <span className="font-display text-lg font-semibold tracking-tight text-primary">
              kaupet
            </span>
            <span className="font-display text-lg text-brand">.</span>
            <span className="font-display text-sm text-muted-foreground">no</span>
          </span>
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">
            Ny annonse
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {status}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onCancel}
              aria-label="Avbryt annonseopprettelse"
            >
              <X className="size-5" aria-hidden />
            </Button>
          </div>
        </div>
      )}
      <NativePageHeader
        title={title || "Ny annonse"}
        backLabel={backLabel}
        onBack={onBack}
        hideBack={native}
        center={progressInHeader ? progress : undefined}
        right={
          native ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onCancel}
              className="native-touch-target"
              aria-label="Avbryt annonseopprettelse"
            >
              <X className="size-5" aria-hidden />
            </Button>
          ) : undefined
        }
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

      {((progress && !progressInHeader) || showToolbar) && (
        <div
          className={cn(
            "sticky top-[var(--site-header-h)] z-10 -mx-4 mt-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur",
            native &&
              "animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none",
          )}
        >
          {progress}
          {showToolbar && (
            <div data-composer-toolbar="desktop" className="mt-2 hidden items-center gap-3 lg:flex">
              <div className="min-w-0 flex-1">{strength}</div>
              {preview && (
                <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
                  <SheetTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-mr-2 shrink-0 gap-1.5 dock:hidden"
                    >
                      <Eye className="size-4" aria-hidden />
                      Forhåndsvis
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="right"
                    aria-describedby={undefined}
                    data-composer-preview="desktop"
                    className="flex w-full flex-col overflow-y-auto bg-muted sm:max-w-md"
                  >
                    <SheetHeader>
                      <SheetTitle className="text-sm font-medium text-muted-foreground">
                        {previewLabel}
                      </SheetTitle>
                    </SheetHeader>
                    <PhoneFrame className="mx-auto min-h-0 w-full max-h-[46rem] max-w-[20rem] flex-1">
                      {preview}
                    </PhoneFrame>
                  </SheetContent>
                </Sheet>
              )}
            </div>
          )}
        </div>
      )}

      <ComposerErrorSummary message={errorSummary ?? null} />

      <div
        data-composer-layout={showPreview ? "preview-dock" : "single-column"}
        className={cn(
          "contents",
          showPreview &&
            "lg:mx-auto lg:block lg:w-full lg:max-w-[40rem] dock:grid dock:max-w-none dock:grid-cols-[minmax(0,36rem)_20rem] dock:items-start dock:justify-center dock:gap-16",
        )}
      >
        <div className={showPreview ? "min-w-0" : "contents"}>
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
            onScroll={native ? (e) => setScrolled(e.currentTarget.scrollTop > 0) : undefined}
            onAnimationEndCapture={() => {
              setDismissedValidationAttempt(validationAttempt);
            }}
            onInputCapture={() => {
              setDismissedValidationAttempt(validationAttempt);
              lastEditAtRef.current = performance.now();
            }}
            // Valg som ikke gir input-hendelser (chips, Radix Select — også i
            // portaler, som React-hendelser bobler gjennom).
            onPointerDownCapture={() => (lastEditAtRef.current = performance.now())}
            onKeyDownCapture={() => (lastEditAtRef.current = performance.now())}
          >
            <h2 ref={pageHeadingRef} tabIndex={-1} className="sr-only">
              {pageTitle}
            </h2>
            {children}
            {challenge}
          </div>

          <div
            data-composer-footer={native ? "native" : "web"}
            className={cn(
              "[&_button]:min-h-12 [&_button]:min-w-12",
              native
                ? "px-safe pb-safe shrink-0 border-t border-border bg-background/95 pt-3 backdrop-blur"
                : "sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-4 pt-3 pb-3 max-lg:pb-[max(0.75rem,var(--safe-bottom))] backdrop-blur lg:static lg:z-auto lg:mx-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-6 lg:backdrop-blur-none",
              !native && (firstStep ? "justify-end" : "justify-between"),
            )}
          >
            {native ? (
              <div className="mx-auto grid w-full max-w-lg grid-cols-2 items-center gap-3">
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
                <div className="min-w-0 justify-self-end">{footer}</div>
              </div>
            ) : (
              footer
            )}
          </div>
        </div>

        {showPreview && (
          <div
            data-composer-preview-dock
            className="sticky top-[calc(var(--site-header-h)+7rem)] mt-8 hidden space-y-2 dock:block"
          >
            <p className="text-center text-xs text-muted-foreground">{previewLabel}</p>
            <PhoneFrame
              ref={previewFrameRef}
              className="h-[min(46rem,calc(100dvh-var(--site-header-h)-14rem))]"
            >
              {preview}
            </PhoneFrame>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Scroller telefonrammen til `target` uten å røre siden (scrollIntoView ville
 * også scrollet vinduet). `nearest` lar rammen stå når elementet allerede
 * vises helt, og bunnjusterer elementer under synsfeltet som får plass — over
 * den faste bunnlinjen, ikke bak den.
 */
function scrollPreviewFrame(frame: HTMLElement, target: HTMLElement, block: "start" | "nearest") {
  const margin = 16;
  const frameRect = frame.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  // Den faste bunnlinjen dekker bunnen av rammen — det synlige området slutter over den.
  const stickyBottom = frame.querySelector<HTMLElement>("[data-preview-sticky-bottom]");
  const visibleBottom = frameRect.bottom - (stickyBottom?.offsetHeight ?? 0);
  let delta = rect.top - frameRect.top - margin;
  if (block === "nearest") {
    if (rect.top >= frameRect.top && rect.bottom <= visibleBottom) return;
    if (rect.top > frameRect.top && rect.height + 2 * margin <= visibleBottom - frameRect.top)
      delta = rect.bottom - visibleBottom + margin;
  }
  frame.scrollTo({
    top: frame.scrollTop + delta,
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

/**
 * Telefonrammen rundt forhåndsvisningen: skiller visningen fra skjemaet og
 * minner om at de fleste kjøpere ser annonsen på mobil. Innholdet er `inert`
 * — lenker og knapper i annonsesiden skal ikke kunne trykkes eller fokuseres
 * herfra, og skjermlesere har skjemaet som kilde. Rammen selv scroller.
 */
function PhoneFrame({
  ref,
  className,
  children,
}: {
  ref?: Ref<HTMLDivElement>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-phone-frame
      className={cn(
        "overflow-hidden rounded-[2rem] border-[6px] border-foreground bg-background shadow-lg",
        className,
      )}
    >
      <div ref={ref} className="h-full overflow-y-auto overscroll-contain">
        <div inert>{children}</div>
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
