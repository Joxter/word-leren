import { css, cx } from "@linaria/core";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

// `field-sizing` does the whole job on its own, but it only became Baseline in
// mid-2026, so the measuring below stands in for browsers a version or two
// behind. Padding, borders and `min-height` stay with the caller's class.
const grows = css`
  field-sizing: content;
  resize: none;
  overflow-y: hidden;
`;

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Off for a field that should keep a fixed height and scroll instead.
   * Nothing sets it yet — every textarea here wants to grow.
   */
  grow?: boolean;
}

/**
 * A textarea that follows the height of its content, so nothing has to be
 * scrolled inside a box while it is being written.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ grow = true, className, ...rest }, ref) {
    const inner = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => inner.current!, []);

    const byHand =
      grow &&
      typeof CSS !== "undefined" &&
      !CSS.supports("field-sizing: content");

    const fit = useCallback(() => {
      const el = inner.current;
      if (!el) return;
      // Back to nothing first, or the box could only ever get taller.
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, []);

    // Keyed on the value rather than on input, so a change the user didn't type
    // — clearing the search box, loading a row into the form — resizes too.
    useLayoutEffect(() => {
      if (byHand) fit();
    }, [byHand, fit, rest.value]);

    // A narrower box wraps into more lines, so width changes need a re-fit.
    useEffect(() => {
      if (!byHand) return;
      window.addEventListener("resize", fit);
      return () => window.removeEventListener("resize", fit);
    }, [byHand, fit]);

    return (
      <textarea
        {...rest}
        ref={inner}
        className={grow ? cx(grows, className) : className}
      />
    );
  },
);
