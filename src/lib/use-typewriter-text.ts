import { useEffect, useState } from "react";

type Options = {
  /** ms per typed/deleted character */
  typeSpeed?: number;
  deleteSpeed?: number;
  /** ms a fully-typed word stays on screen before deleting starts */
  hold?: number;
  /** pause animation (e.g. when the field is focused or has a value) */
  paused?: boolean;
};

/**
 * Types out each word in `words` one character at a time, holds it, then
 * deletes it before moving to a random next word — a classic typewriter
 * effect, returned as a plain string.
 *
 * This is meant to be assigned directly to an `<input>`'s native
 * `placeholder` attribute rather than rendered as a separately positioned
 * overlay element: a synthetic overlay has to replicate the input's exact
 * font, padding and truncation behavior, which browsers implement
 * inconsistently for plain inline elements and is a recurring source of
 * cross-browser clipping bugs. The native placeholder is sized and clipped
 * by the browser itself, which is reliable everywhere.
 */
export function useTypewriterText(words: string[], options: Options = {}): string {
  const { typeSpeed = 90, deleteSpeed = 40, hold = 1400, paused = false } = options;

  const [wordIndex, setWordIndex] = useState(() => Math.floor(Math.random() * words.length));
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"typing" | "holding" | "deleting">("typing");

  useEffect(() => {
    if (paused) return;
    const word = words[wordIndex % words.length];

    if (phase === "typing") {
      if (text.length < word.length) {
        const id = window.setTimeout(() => setText(word.slice(0, text.length + 1)), typeSpeed);
        return () => window.clearTimeout(id);
      }
      const id = window.setTimeout(() => setPhase("holding"), hold);
      return () => window.clearTimeout(id);
    }

    if (phase === "holding") {
      const id = window.setTimeout(() => setPhase("deleting"), hold);
      return () => window.clearTimeout(id);
    }

    // deleting
    if (text.length > 0) {
      const id = window.setTimeout(() => setText(word.slice(0, text.length - 1)), deleteSpeed);
      return () => window.clearTimeout(id);
    }
    setWordIndex((i) => {
      if (words.length <= 1) return i;
      // Pick a random next word, but never repeat the one just shown.
      let next = Math.floor(Math.random() * (words.length - 1));
      if (next >= i % words.length) next += 1;
      return next;
    });
    setPhase("typing");
  }, [paused, phase, text, wordIndex, words, typeSpeed, deleteSpeed, hold]);

  return paused ? "" : text;
}
