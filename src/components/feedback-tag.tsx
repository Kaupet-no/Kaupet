import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageSquareHeart, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useIsNative } from "@/hooks/use-is-native";
import { submitFeedback } from "@/lib/feedback.functions";
import { formatErrorMessage } from "@/lib/errors";

type FeedbackType = "ris" | "ros";

/**
 * The shared feedback form: pick Ros (🤩) or Ris (😖), write a message, send.
 * Used both inside the web FeedbackTag popover and the native "Meg" page
 * sheet. Fires a confetti burst (canvas-confetti, dynamically imported) on
 * success and calls `onDone` after the thank-you state has shown.
 */
export function FeedbackPanel({ onDone }: { onDone?: () => void }) {
  const [type, setType] = useState<FeedbackType | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitFn = useServerFn(submitFeedback);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    },
    [],
  );

  const send = async () => {
    if (!type || !message.trim()) return;
    setSending(true);
    setError(null);
    try {
      const pageUrl = typeof window !== "undefined" ? window.location.href : undefined;
      await submitFn({ data: { type, message: message.trim(), pageUrl } });
      setSent(true);
      try {
        if (confettiCanvasRef.current) {
          const confetti = (await import("canvas-confetti")).default;
          const fire = confetti.create(confettiCanvasRef.current, {
            resize: true,
            useWorker: false,
          });
          fire({ particleCount: 60, spread: 70, startVelocity: 25, origin: { y: 0.7 } });
        }
      } catch {
        // Confetti is decorative — never block the thank-you on it.
      }
      doneTimer.current = setTimeout(() => {
        setType(null);
        setMessage("");
        setSent(false);
        onDone?.();
      }, 2500);
    } catch (e) {
      setError(formatErrorMessage(e, "Kunne ikke sende tilbakemeldingen. Prøv igjen."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative">
      <canvas
        ref={confettiCanvasRef}
        className="pointer-events-none absolute inset-0 z-10 size-full"
      />
      {sent ? (
        <p className="px-2 py-6 text-center text-sm font-medium">
          Tilbakemelding sendt! Tusen takk!
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-center gap-3">
            <button
              type="button"
              aria-label="Ros"
              aria-pressed={type === "ros"}
              onClick={() => setType("ros")}
              className={`rounded-full p-1 text-3xl transition-transform duration-150 ease-out hover:-translate-y-1 ${
                type === "ros" ? "bg-primary/10 ring-2 ring-primary" : ""
              }`}
            >
              🤩
            </button>
            <button
              type="button"
              aria-label="Ris"
              aria-pressed={type === "ris"}
              onClick={() => setType("ris")}
              className={`rounded-full p-1 text-3xl transition-transform duration-150 ease-out hover:-translate-y-1 ${
                type === "ris" ? "bg-destructive/10 ring-2 ring-destructive" : ""
              }`}
            >
              😖
            </button>
          </div>
          {type && (
            <div className="space-y-2">
              <Textarea
                autoFocus
                rows={4}
                maxLength={2000}
                placeholder={type === "ros" ? "Hva liker du?" : "Hva kan vi gjøre bedre?"}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="button"
                className="w-full gap-2"
                disabled={sending || !message.trim()}
                onClick={send}
              >
                {sending && <Loader2 className="size-4 animate-spin" />}
                Send tilbakemelding
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "Ris og Ros" — a compact icon-only feedback button fixed to the right edge,
 * near the bottom of the top quarter of the viewport (never above the
 * header). Web only, from md up: hover glides the label into view, click
 * opens the panel.
 */
export function FeedbackTag() {
  const native = useIsNative();
  const [open, setOpen] = useState(false);
  const [overlapping, setOverlapping] = useState(false);
  const tagRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Hide the collapsed button whenever page content (e.g. a ScrollArrowRow's
  // right-edge arrow in a hero near the top of the page) sits under its
  // corners — a full-bleed wrapper spanning most of the viewport width
  // doesn't count, only something specific enough to actually collide.
  useEffect(() => {
    if (native || open) return;
    const el = tagRef.current;
    if (!el) return;
    const check = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      const corners: [number, number][] = [
        [rect.left + 2, rect.top + 2],
        [rect.left + 2, rect.bottom - 2],
      ];
      const hit = corners.some(([x, y]) =>
        document
          .elementsFromPoint(x, y)
          .some(
            (n) => !el.contains(n) && n.getBoundingClientRect().width < window.innerWidth * 0.9,
          ),
      );
      setOverlapping(hit);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [native, open]);

  if (native) return null;

  return (
    <div
      ref={tagRef}
      className={`fixed right-0 top-[max(25vh,4.5rem)] z-40 hidden md:block print:hidden ${
        overlapping && !open ? "invisible" : ""
      }`}
    >
      {open ? (
        <div className="w-72 rounded-l-xl border border-r-0 border-border bg-card p-4 shadow-lg duration-200 animate-in slide-in-from-right-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Vi vil gjerne høre fra deg!</p>
            <button
              type="button"
              aria-label="Lukk"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          </div>
          <FeedbackPanel onDone={() => setOpen(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ris og Ros"
          className="group flex h-10 w-10 items-center justify-center overflow-hidden rounded-l-md border border-r-0 border-border bg-card/95 text-muted-foreground shadow-md backdrop-blur transition-[width,color,background-color] duration-200 ease-out hover:w-28 hover:bg-card hover:text-foreground"
        >
          <MessageSquareHeart className="size-4 shrink-0 text-rose-500/80" />
          <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold tracking-wide opacity-0 transition-[max-width,margin-left,opacity] duration-200 ease-out group-hover:ml-1.5 group-hover:max-w-[5rem] group-hover:opacity-100">
            Ris og Ros
          </span>
        </button>
      )}
    </div>
  );
}
