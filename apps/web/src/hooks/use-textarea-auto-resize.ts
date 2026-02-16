import { useCallback, useEffect } from "react";

/**
 * Auto-resizes a `<textarea>` to fit its content, up to `maxHeight` pixels.
 *
 * Re-runs whenever `value` changes.
 */
export function useTextareaAutoResize(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxHeight = 300,
) {
  const adjustHeight = useCallback(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [ref, maxHeight]);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);
}
