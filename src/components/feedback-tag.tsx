import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X } from "lucide-react";

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
      await submitFn({ data: { type, message: message.trim() } });
      setSent(true);
      try {
        const confetti = (await import("canvas-confetti")).default;
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 } });
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

  if (sent) {
    return (
      <p className="px-2 py-6 text-center text-sm font-medium">Tilbakemelding sendt! Tusen takk!</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-3">
        <button
          type="button"
          aria-label="Ros"
          aria-pressed={type === "ros"}
          onClick={() => setType("ros")}
          className={`rounded-full p-1 text-3xl transition-transform hover:scale-110 ${
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
          className={`rounded-full p-1 text-3xl transition-transform hover:scale-110 ${
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
  );
}

/**
 * "Ris og Ros" — a tag-shaped feedback button fixed to the right edge in the
 * lower half of the window. Web desktop only (hidden on native and below lg,
 * where horizontal space is precious): hover nudges it out, click springs the
 * panel fully open.
 */
export function FeedbackTag() {
  const native = useIsNative();
  const [open, setOpen] = useState(false);
  if (native) return null;

  return (
    <div className="fixed right-0 top-2/3 z-40 hidden -translate-y-1/2 lg:block print:hidden">
      {open ? (
        <div className="w-72 rounded-l-xl border border-r-0 border-border bg-card p-4 shadow-lg duration-200 animate-in slide-in-from-right-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Ris og Ros</p>
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
          className="block translate-x-1.5 rounded-l-md bg-red-700 px-1.5 py-4 text-sm font-semibold tracking-wide text-white shadow-md transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:translate-x-0"
          style={{ writingMode: "vertical-rl" }}
        >
          Ris og Ros
        </button>
      )}
    </div>
  );
}
