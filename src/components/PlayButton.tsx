import { css } from "@linaria/core";

const playBtn = css`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid #d5d5d5;
  background: #fff;
  border-radius: 6px;
  padding: 0.35rem 0.7rem;
  font-size: 0.85rem;
  line-height: 1;
  color: #1a1a1a;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    border-color: #1a1a1a;
    background: #f7f7f7;
  }
`;

const playBtnSmall = css`
  padding: 0.2rem 0.4rem;
  font-size: 0.75rem;
  border-radius: 5px;
`;

// Plays an audio file stored as a path relative to public/, e.g.
// "audio/dict/hond.mp3". encodeURI keeps "/" but escapes spaces/quotes that
// occur in some clip filenames.
export function playAudio(path: string) {
  const audio = new Audio(encodeURI(`${import.meta.env.BASE_URL}${path}`));
  audio.play().catch(() => {});
}

export default function PlayButton({
  path,
  label,
  small,
}: {
  path: string;
  label?: string;
  small?: boolean;
}) {
  function play(e: React.MouseEvent) {
    // Keep clicks from reaching a clickable parent (e.g. a card row).
    e.stopPropagation();
    playAudio(path);
  }
  return (
    <button
      type="button"
      className={small ? `${playBtn} ${playBtnSmall}` : playBtn}
      onClick={play}
      title="Play audio"
      aria-label="Play audio"
    >
      ▶{label ? <span>{label}</span> : null}
    </button>
  );
}
