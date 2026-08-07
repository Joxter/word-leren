import { useCallback, useState, type RefObject } from "react";

export interface SelectionRange {
  start: number;
  end: number;
}

/**
 * Reads the user's text selection back as offsets into a sentence. Works with
 * any container whose text nodes sit inside elements carrying `data-start` —
 * the token markup both span pickers render — so an offset is the token's start
 * plus the offset within its single text node.
 */
export function useTextSelection(rootRef: RefObject<HTMLElement | null>) {
  const [hasSelection, setHasSelection] = useState(false);

  const current = useCallback((): SelectionRange | null => {
    const sel = window.getSelection();
    const root = rootRef.current;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root) return null;
    const range = sel.getRangeAt(0);
    if (
      !root.contains(range.startContainer) ||
      !root.contains(range.endContainer)
    )
      return null;
    const start = offsetOf(range.startContainer, range.startOffset);
    const end = offsetOf(range.endContainer, range.endOffset);
    if (start === null || end === null || end <= start) return null;
    return { start, end };
  }, [rootRef]);

  const refresh = useCallback(
    () => setHasSelection(current() !== null),
    [current],
  );

  const clear = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setHasSelection(false);
  }, []);

  return { hasSelection, current, refresh, clear };
}

function offsetOf(node: Node | null, offset: number): number | null {
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const el = node.parentElement;
  const start = el?.dataset?.start;
  if (start === undefined) return null;
  return Number(start) + offset;
}
