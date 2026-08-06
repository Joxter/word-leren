import { css } from "@linaria/core";
import { anchorSpans, segmentText, type Span } from "../lib/examples";

const wrap = css`
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
`;

const marked = css`
  font-weight: 600;
  background: #fff3c4;
  border-radius: 3px;
  padding: 0 0.1em;
`;

const blank = css`
  font-weight: 600;
  color: #999;
  letter-spacing: 0.05em;
`;

interface Props {
  text: string;
  spans: Span[];
  /**
   * `highlight` shows the whole sentence with the linked fragments called out;
   * `blank` replaces them with underscores, the way a cloze prompt reads.
   */
  mode?: "highlight" | "blank";
  className?: string;
}

/**
 * An example sentence with its linked fragments marked. Spans are re-anchored
 * on the way in (without persisting), so a sentence edited after the link was
 * saved still renders correctly — see `anchorSpans`.
 */
export default function ExampleText({
  text,
  spans,
  mode = "highlight",
  className,
}: Props) {
  const anchored = anchorSpans(text, spans).spans;
  const segments = segmentText(text, anchored);

  return (
    <span className={className ? `${wrap} ${className}` : wrap}>
      {segments.map((seg, i) => {
        if (!seg.blank) return <span key={i}>{seg.text}</span>;
        if (mode === "blank") {
          return (
            <span key={i} className={blank}>
              {"_".repeat(Math.max(2, [...seg.text].length))}
            </span>
          );
        }
        return (
          <span key={i} className={marked}>
            {seg.text}
          </span>
        );
      })}
    </span>
  );
}
