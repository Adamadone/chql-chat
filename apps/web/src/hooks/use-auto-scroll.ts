import { useCallback, useEffect, useRef, useState } from "react";
import { easeOutCubic } from "@/utils/easing";

const BOTTOM_THRESHOLD = 40;

interface UseAutoScrollOptions {
  /** Re-scroll triggers — when any value changes, latched scroll is re-applied. */
  deps: unknown[];
  /** Called when a new pending message arrives (forces latch). */
  pendingMessage: unknown | null;
}

/**
 * Manages "latch-to-bottom" scroll behaviour for a Radix `ScrollArea`.
 *
 * Returns a ref to attach to the `ScrollArea` wrapper, a flag for showing a
 * "jump to bottom" button, a handler to jump down, and a callback that
 * components can call when they grow (e.g. typewriter) so the viewport
 * stays pinned.
 */
export function useAutoScroll({ deps, pendingMessage }: UseAutoScrollOptions) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isLatchedRef = useRef(true);
  const [showJumpButton, setShowJumpButton] = useState(false);

  const getViewport = useCallback(() => {
    return scrollAreaRef.current?.querySelector<HTMLDivElement>(
      "[data-radix-scroll-area-viewport]",
    );
  }, []);

  const scrollToBottom = useCallback(() => {
    const viewport = getViewport();
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [getViewport]);

  const smoothScrollToBottom = useCallback(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const start = viewport.scrollTop;
    const target = viewport.scrollHeight - viewport.clientHeight;
    const distance = target - start;
    if (distance <= 0) return;

    const duration = Math.min(400, Math.max(150, distance * 0.5));
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      viewport.scrollTop = start + distance * easeOutCubic(progress);
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  }, [getViewport]);

  /** Keep viewport pinned when content changes and the user is latched. */
  const handleLatchedScroll = useCallback(() => {
    if (isLatchedRef.current) {
      scrollToBottom();
    }
  }, [scrollToBottom]);

  // Track user scroll to update latch state
  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const onScroll = () => {
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const latched = distanceFromBottom <= BOTTOM_THRESHOLD;
      isLatchedRef.current = latched;
      setShowJumpButton(!latched);
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [getViewport]);

  // Re-scroll when deps change and user is latched
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isLatchedRef.current) {
      scrollToBottom();
    }
  }, [...deps, scrollToBottom]);

  // Force latch when a new pending message appears
  useEffect(() => {
    if (pendingMessage) {
      isLatchedRef.current = true;
      setShowJumpButton(false);
    }
  }, [pendingMessage]);

  const handleJumpToBottom = useCallback(() => {
    isLatchedRef.current = true;
    setShowJumpButton(false);
    smoothScrollToBottom();
  }, [smoothScrollToBottom]);

  return {
    scrollAreaRef,
    showJumpButton,
    handleJumpToBottom,
    handleLatchedScroll,
  } as const;
}
