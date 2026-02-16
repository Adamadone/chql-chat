import { useRef } from "react";

/**
 * Provides arrow-key browsing through a list of previous user messages,
 * similar to a shell history. The most recent message is at index 0.
 *
 * `historyIndex` of `-1` means the user is typing a new (draft) message.
 */
export function useMessageHistory(
  history: string[],
  input: string,
  setInput: (value: string) => void,
  isSending: boolean,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
) {
  const historyIndexRef = useRef(-1);
  const draftRef = useRef("");

  /** Reset browsing state (e.g. after sending). */
  const resetHistory = () => {
    historyIndexRef.current = -1;
    draftRef.current = "";
  };

  /** Call inside the textarea's `onKeyDown` handler. */
  const handleHistoryKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (e.key === "ArrowUp" && !isSending && history.length > 0) {
      const cursorAtTop =
        textarea.selectionStart === 0 && textarea.selectionEnd === 0;
      if (!cursorAtTop) return;

      e.preventDefault();

      if (historyIndexRef.current === -1) {
        draftRef.current = input;
      }

      const nextIndex = historyIndexRef.current + 1;
      if (nextIndex >= history.length) return;

      historyIndexRef.current = nextIndex;
      setInput(history[nextIndex]);
    }

    if (e.key === "ArrowDown" && !isSending && historyIndexRef.current >= 0) {
      const value = textarea.value;
      const cursorAtBottom =
        textarea.selectionStart === value.length &&
        textarea.selectionEnd === value.length;
      if (!cursorAtBottom) return;

      e.preventDefault();

      const nextIndex = historyIndexRef.current - 1;

      if (nextIndex < 0) {
        historyIndexRef.current = -1;
        setInput(draftRef.current);
      } else {
        historyIndexRef.current = nextIndex;
        setInput(history[nextIndex]);
      }
    }
  };

  return { handleHistoryKeyDown, resetHistory } as const;
}
