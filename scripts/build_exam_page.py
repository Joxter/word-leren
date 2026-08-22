#!/usr/bin/env python3
"""Rebuild an exported Optimum exam result page as one clean, readable HTML page.

Usage: python3 build_exam_page.py <input.html> [output.html]

The exported page wraps every bit of text in a custom media player (a
text-to-speech clip per question and per answer option), which makes the
answers impossible to select and buries the one recording that actually *is*
the task. This script keeps the case text, the task recording, the questions
and the options as plain selectable text, and drops the rest.

Answers are marked up but hidden behind a toggle, so the page can be used to
retake the exam before looking at what was picked the first time.
"""

import os
import re
import sys
from copy import copy
from html import escape
from pathlib import Path
from urllib.parse import quote, unquote

from bs4 import BeautifulSoup, NavigableString

# Boilerplate the exam prints above every recording; it says nothing that the
# rebuilt page doesn't already show.
INSTRUCTION_RE = re.compile(
    r"^(lees eerst de vraag|lees eerst de vragen|lees daarna"
    r"|kijk daarna|luister daarna|bekijk daarna)\b",
    re.I,
)

# Attributes worth keeping; everything else is framework noise (style, aria,
# clarity-ui classes, Vue data attributes).
KEEP_ATTRS = {"src", "alt", "colspan", "rowspan"}
DROP_TAGS = {"clr-icon", "svg", "path", "script", "style", "button", "input"}


def rel_media(src: str, input_dir: Path, output_dir: Path) -> str:
    """Rewrite a media/image src to a path valid relative to the output file."""
    if not src or src.startswith(("http://", "https://", "data:")):
        return src
    asset = (input_dir / unquote(src)).resolve()
    return quote(os.path.relpath(asset, output_dir.resolve()))


def clean_fragment(node, input_dir: Path, output_dir: Path) -> str:
    """Return node's inner HTML with players, instructions and cruft removed."""
    if node is None:
        return ""
    node = copy(node)

    for player in node.select(".media-player"):
        player.decompose()
    for tag in node.find_all(list(DROP_TAGS)):
        tag.decompose()

    for text in list(node.find_all(string=True)):
        if INSTRUCTION_RE.match(text.strip()):
            text.extract()

    for tag in node.find_all(True):
        if tag.name == "img":
            tag["src"] = rel_media(tag.get("src", ""), input_dir, output_dir)
        tag.attrs = {k: v for k, v in tag.attrs.items() if k in KEEP_ATTRS}

    html = node.decode_contents()
    # The instruction text left <br>/<p> scaffolding behind; collapse it.
    html = re.sub(r"(?:\s*<br\s*/?>\s*){2,}", "<br/>", html)
    html = re.sub(r"<p>\s*(?:<br\s*/?>)?\s*</p>", "", html)
    html = re.sub(r"^(?:\s|<br\s*/?>)+", "", html)
    html = re.sub(r"(?:\s|<br\s*/?>)+$", "", html)
    return html.strip()


def parse_media(player, input_dir: Path, output_dir: Path) -> dict | None:
    el = player.find(["audio", "video"])
    source = el.find("source") if el else None
    if not source:
        return None
    duration = player.select_one(".time-left")
    return {
        "kind": el.name,
        "src": rel_media(source.get("src", ""), input_dir, output_dir),
        "duration": duration.get_text(strip=True) if duration else "",
    }


def seconds(duration: str) -> int:
    parts = [int(p) for p in duration.split(":")] if duration else [0]
    return sum(p * 60**i for i, p in enumerate(reversed(parts)))


def parse_question(review_item, input_dir: Path, output_dir: Path) -> dict:
    header = review_item.select_one(".question-header h5")
    options = []
    for choice in review_item.select(".simple-choice"):
        opt = choice.select_one(".simple-choice-option")
        if not opt:
            continue
        label = opt.select_one(".answer-label")
        classes = opt.get("class", [])
        options.append(
            {
                "label": label.get_text(strip=True) if label else "",
                "html": clean_fragment(
                    opt.select_one(".answer-content"), input_dir, output_dir
                ),
                "correct": "correct" in classes,
                "picked": "active" in classes,
            }
        )
    return {
        "title": header.get_text(strip=True) if header else "Vraag",
        "html": clean_fragment(
            review_item.select_one(".tt-item-text"), input_dir, output_dir
        ),
        "options": options,
    }


def parse_opgave(table, index: int, input_dir: Path, output_dir: Path) -> dict:
    case = table.select_one(".case-text")
    task_media = None
    if case:
        players = [
            m
            for m in (
                parse_media(p, input_dir, output_dir)
                for p in case.select(".media-player")
            )
            if m
        ]
        if players:
            # The task recording is the last player in the case text; the ones
            # before it read out the intro and the instruction. It is also the
            # longest one, so a mismatch means the export changed shape.
            task_media = players[-1]
            longest = max(players, key=lambda m: seconds(m["duration"]))
            if longest is not task_media:
                print(
                    f"  ! opgave {index}: last clip ({task_media['duration']}) is not"
                    f" the longest ({longest['duration']}), check the result",
                    file=sys.stderr,
                )

    return {
        "index": index,
        "case_html": clean_fragment(case, input_dir, output_dir),
        "media": task_media,
        "questions": [
            parse_question(ri, input_dir, output_dir)
            for ri in table.select(".ReviewItem")
        ],
    }


def find_opgave_tables(soup):
    tables = []
    for table in soup.select("table.review-case"):
        th = table.find("th")
        h5 = th.find("h5") if th else None
        if not h5 or h5.get_text(strip=True) != "Opgave":
            continue
        # Skip nested "Casustekst" tables, which share the review-case class.
        if table.find_parent("table", class_="review-case"):
            continue
        tables.append(table)
    return tables


def parse_details(soup) -> list[tuple[str, str]]:
    """The "Details examensessie" card, minus the rows the export left blank."""
    details = []
    for row in soup.select(".exam-session-card .detail-row"):
        parts = [t.strip() for t in row.stripped_strings]
        parts = [p for p in parts if p]
        if len(parts) < 2:
            continue
        label, value = parts[0].rstrip(":"), " ".join(parts[1:])
        # The export leaves unused rows as a dash, and a placeholder
        # time limit as "0 min".
        if value in {"-", "", "0 min"}:
            continue
        details.append((label, value))
    return details


def render_media(media: dict) -> str:
    if not media:
        return ""
    tag = "video" if media["kind"] == "video" else "audio"
    dur = f'<span class="duration">{escape(media["duration"])}</span>' if media["duration"] else ""
    return (
        f'<div class="task-media">'
        f'<{tag} controls preload="metadata" src="{media["src"]}"></{tag}>{dur}'
        f"</div>"
    )


def render_option(opt: dict) -> str:
    classes = ["opt"]
    if opt["correct"]:
        classes.append("correct")
    if opt["picked"]:
        classes.append("picked")
    mark = "✓" if opt["correct"] else ("✗" if opt["picked"] else "")
    return (
        f'<li class="{" ".join(classes)}">'
        f'<span class="num">{escape(opt["label"])}</span>'
        f'<span class="txt">{opt["html"]}</span>'
        f'<span class="mark">{mark}</span>'
        f"</li>"
    )


def render_question(q: dict) -> str:
    opts = "\n".join(render_option(o) for o in q["options"])
    return (
        f'<section class="vraag">'
        f'<h3>{escape(q["title"])}</h3>'
        f'<div class="qtext">{q["html"]}</div>'
        f'<ul class="opts">{opts}</ul>'
        f"</section>"
    )


def render_opgave(op: dict) -> str:
    case = f'<div class="case">{op["case_html"]}</div>' if op["case_html"] else ""
    questions = "\n".join(render_question(q) for q in op["questions"])
    return (
        f'<article class="opgave" id="opgave-{op["index"]}">'
        f'<h2>Opgave {op["index"]}</h2>'
        f"{case}{render_media(op['media'])}{questions}"
        f"</article>"
    )


def score(opgaven: list[dict]) -> tuple[int, int]:
    total = right = 0
    for op in opgaven:
        for q in op["questions"]:
            total += 1
            correct = {o["label"] for o in q["options"] if o["correct"]}
            picked = {o["label"] for o in q["options"] if o["picked"]}
            if correct and correct == picked:
                right += 1
    return right, total


CSS = """
:root { color-scheme: light dark; --line: #d8d8d8; --dim: #6b6b6b;
        --ok: #1a7f37; --bad: #c0392b; --bg-ok: #e8f5ec; --bg-bad: #fdecea; }
@media (prefers-color-scheme: dark) {
  :root { --line: #3a3a3a; --dim: #9a9a9a; --ok: #4ac26b; --bad: #ff6b5e;
          --bg-ok: #14301c; --bg-bad: #3a1a17; }
}
* { box-sizing: border-box; }
body { margin: 0 auto; padding: 0 1.5rem 6rem; max-width: 46rem;
       font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { position: sticky; top: 0; z-index: 2; padding: 1rem 0 .75rem;
         background: Canvas; border-bottom: 1px solid var(--line); }
h1 { margin: 0 0 .25rem; font-size: 1.35rem; }
.meta { color: var(--dim); font-size: .85rem; }
.meta b { color: inherit; }
.toggle { display: inline-flex; gap: .4rem; align-items: center;
          margin-top: .6rem; font-size: .9rem; cursor: pointer; user-select: none; }
.opgave { padding-top: 1.5rem; border-top: 1px solid var(--line); margin-top: 2rem; }
h2 { font-size: 1.05rem; color: var(--dim); text-transform: uppercase;
     letter-spacing: .06em; margin: 0 0 .75rem; }
h3 { font-size: .8rem; color: var(--dim); text-transform: uppercase;
     letter-spacing: .06em; margin: 1.75rem 0 .35rem; }
.case { margin-bottom: 1rem; }
.case img { max-width: 100%; height: auto; border-radius: 6px; }
.task-media { margin: 1rem 0 .5rem; display: flex; align-items: center; gap: .6rem; }
.task-media video { width: 100%; max-width: 40rem; border-radius: 8px; background: #000; }
.task-media audio { width: 100%; max-width: 30rem; }
.duration { color: var(--dim); font-size: .8rem; font-variant-numeric: tabular-nums; }
.qtext { font-weight: 600; margin-bottom: .6rem; }
.opts { list-style: none; margin: 0; padding: 0; }
.opt { display: flex; gap: .6rem; align-items: baseline; padding: .35rem .6rem;
       border-radius: 6px; border: 1px solid transparent; }
.num { color: var(--dim); user-select: none; min-width: 1.1em; }
.txt { flex: 1; }
.mark { visibility: hidden; user-select: none; font-weight: 700; }
/* Answers stay invisible until the toggle turns them on. */
body.show-answers .opt.correct { background: var(--bg-ok); border-color: var(--ok); }
body.show-answers .opt.picked:not(.correct) { background: var(--bg-bad); border-color: var(--bad); }
body.show-answers .opt.correct .mark { visibility: visible; color: var(--ok); }
body.show-answers .opt.picked:not(.correct) .mark { visibility: visible; color: var(--bad); }
body.show-answers .opt.picked .num::after { content: " ←"; }
@media print { header { position: static; } .toggle { display: none; } }
"""

SCRIPT = """
const box = document.getElementById('show-answers');
box.addEventListener('change', () => {
  document.body.classList.toggle('show-answers', box.checked);
});
"""


def render_page(title: str, details, opgaven: list[dict]) -> str:
    right, total = score(opgaven)
    meta = " · ".join(f"{escape(k)}: {escape(v)}" for k, v in details)
    meta = f"{meta} · <b>{right}/{total}</b>" if meta else f"<b>{right}/{total}</b>"
    body = "\n".join(render_opgave(op) for op in opgaven)
    return f"""<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title>
<style>{CSS}</style>
</head>
<body>
<header>
<h1>{escape(title)}</h1>
<div class="meta">{meta}</div>
<label class="toggle"><input type="checkbox" id="show-answers"> Показать ответы</label>
</header>
{body}
<script>{SCRIPT}</script>
</body>
</html>
"""


def main():
    if len(sys.argv) not in (2, 3):
        print(f"Usage: {sys.argv[0]} <input.html> [output.html]", file=sys.stderr)
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = (
        Path(sys.argv[2])
        if len(sys.argv) == 3
        else input_path.with_name(input_path.stem + ".clean.html")
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    input_dir = input_path.resolve().parent
    output_dir = output_path.resolve().parent

    soup = BeautifulSoup(input_path.read_text(encoding="utf-8"), "lxml")
    tables = find_opgave_tables(soup)
    if not tables:
        print("No Opgave tables found.", file=sys.stderr)
        sys.exit(1)

    opgaven = [
        parse_opgave(t, i, input_dir, output_dir) for i, t in enumerate(tables, 1)
    ]
    details = parse_details(soup)
    title = re.sub(r"\.clean$", "", output_path.stem)
    started = dict(details).get("Begonnen", "")
    if started:
        title = f"{title} — {started.split()[0]}"
    output_path.write_text(render_page(title, details, opgaven), encoding="utf-8")

    right, total = score(opgaven)
    media = sum(1 for op in opgaven if op["media"])
    print(
        f"{len(opgaven)} opgaven, {total} vragen, {media} opnames, score {right}/{total}"
    )
    print(f"wrote {output_path}")


if __name__ == "__main__":
    main()
