import { useEffect, useState } from "react";

const CHARS_PER_TICK = 3;
const TICK_MS = 14;

/**
 * Reveals `text` character-by-character using `requestAnimationFrame`.
 *
 * Returns the portion of text to display and a boolean indicating whether the
 * animation has finished. Calls `onDone` once when all characters are shown
 * and `onProgress` on every tick so the caller can keep the viewport scrolled.
 */
export function useTypewriter(
  text: string,
  onDone: () => void,
  onProgress: () => void,
) {
  const [charIndex, setCharIndex] = useState(0);
  const isDone = charIndex >= text.length;

  useEffect(() => {
    if (isDone) {
      onDone();
      return;
    }

    let raf: number;
    let last = 0;

    const step = (now: number) => {
      if (now - last >= TICK_MS) {
        last = now;
        setCharIndex((prev) => {
          const next = prev + CHARS_PER_TICK;
          return next >= text.length ? text.length : next;
        });
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isDone, text.length, onDone]);

  useEffect(() => {
    onProgress();
  }, [charIndex, onProgress]);

  const displayed = isDone ? text : text.slice(0, charIndex);

  return { displayed, isDone } as const;
}
