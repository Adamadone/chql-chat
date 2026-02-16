import { useEffect, useRef, useState } from "react";

const CHARS_PER_FRAME = 2;
const FRAME_INTERVAL = 18;

/**
 * Animates a title change with a typewriter effect.
 *
 * When the title transitions from `"New Chat"` to a real title, the new value
 * is revealed character-by-character. All other changes are applied instantly.
 */
export function useAnimatedTitle(title: string) {
  const prevRef = useRef(title);
  const [displayed, setDisplayed] = useState(title);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = title;

    if (prev === "New Chat" && title !== "New Chat") {
      setDisplayed("");
      let index = 0;
      let raf: number;
      let last = 0;

      const step = (time: number) => {
        if (time - last >= FRAME_INTERVAL) {
          last = time;
          index += CHARS_PER_FRAME;
          if (index >= title.length) {
            setDisplayed(title);
            return;
          }
          setDisplayed(title.slice(0, index));
        }
        raf = requestAnimationFrame(step);
      };

      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }

    setDisplayed(title);
  }, [title]);

  return displayed;
}
