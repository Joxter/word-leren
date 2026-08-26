#!/usr/bin/env python3
"""Convert an exported Optimum exam result page into one markdown file.

Usage: python3 exam_to_md.py <input.html> <output.md> [--title "..."]

Unlike parse_leestoets.py (one file per Opgave, images kept), this writes the
whole exam as a single document without images: the case texts, the questions
and their options, and — at the very bottom — the answer key with what was
picked, so the file can be used to retake the exam before looking.

Two export shapes exist. A leestoets/luistertoets nests its questions inside an
"Opgave" table; the KNM exam has flat "Casusscherm" tables that only announce a
theme, with the questions as siblings after them.
"""

import argparse
import os
import re
import sys
from copy import copy
from pathlib import Path
from urllib.parse import quote, unquote

from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent))
import parse_leestoets as renderer  # markdown renderers (lists, tables, bold)

# Boilerplate the exam prints above every recording; it says nothing that the
# generated file doesn't already show.
INSTRUCTION_RE = re.compile(
    r"^(lees eerst de vraag|lees eerst de vragen|lees daarna"
    r"|kijk daarna|luister daarna|bekijk daarna)\b",
    re.I,
)

THEME_RE = re.compile(r"thema\s*['‘\"]([^'’\"]+)['’\"]", re.I)

DROP_TAGS = ["img", "clr-icon", "svg", "path", "script", "style", "button", "input"]


def to_markdown(node) -> str:
    """Render a node as markdown, minus media players, images and instructions."""
    if node is None:
        return ""
    node = copy(node)
    for player in node.select(".media-player"):
        player.decompose()
    for tag in node.find_all(DROP_TAGS):
        tag.decompose()
    for text in list(node.find_all(string=True)):
        if INSTRUCTION_RE.match(text.strip()):
            text.extract()
    return renderer.html_to_text(node)


def seconds(duration: str) -> int:
    parts = [int(p) for p in duration.split(":")] if duration else [0]
    return sum(p * 60**i for i, p in enumerate(reversed(parts)))


def parse_media(player, input_dir: Path, output_dir: Path) -> dict | None:
    el = player.find(["audio", "video"])
    source = el.find("source") if el else None
    if not source:
        return None
    src = source.get("src", "")
    if src and not src.startswith(("http://", "https://", "data:")):
        asset = (input_dir / unquote(src)).resolve()
        src = quote(os.path.relpath(asset, output_dir.resolve()))
    duration = player.select_one(".time-left")
    return {
        "kind": el.name,
        "src": src,
        "duration": duration.get_text(strip=True) if duration else "",
    }


def task_media(case, index, input_dir: Path, output_dir: Path) -> dict | None:
    """The one recording that *is* the task, if the case text has one.

    Every text block also has a text-to-speech clip; the task recording is the
    last player in the case text (the ones before it read out the intro and the
    instruction) and also the longest, so a mismatch means the export changed
    shape.
    """
    if case is None:
        return None
    players = [
        m
        for m in (parse_media(p, input_dir, output_dir) for p in case.select(".media-player"))
        if m
    ]
    if not players:
        return None
    last = players[-1]
    longest = max(players, key=lambda m: seconds(m["duration"]))
    if longest is not last:
        print(
            f"  ! {index}: last clip ({last['duration']}) is not the longest"
            f" ({longest['duration']}), check the result",
            file=sys.stderr,
        )
    return last


def parse_question(review_item) -> dict:
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
                "text": to_markdown(opt.select_one(".answer-content")),
                "correct": "correct" in classes,
                "picked": "active" in classes,
            }
        )
    return {
        "title": header.get_text(strip=True) if header else "Vraag",
        "text": to_markdown(review_item.select_one(".tt-item-text")),
        "options": options,
    }


def parse_sections(soup, input_dir: Path, output_dir: Path) -> list[dict]:
    """Walk the page in document order, grouping questions under their case."""
    sections: list[dict] = []
    opgave_no = 0

    for el in soup.find_all(True):
        classes = el.get("class", [])

        if "review-case" in classes:
            if el.find_parent(class_="review-case"):
                continue  # the "Casustekst" table nested inside an Opgave
            th = el.find("th")
            h5 = th.find("h5") if th else None
            kind = h5.get_text(strip=True) if h5 else ""
            case = el.find("div", class_="case-text")
            intro = to_markdown(case)

            # A "Casusscherm" only announces the theme of the questions that
            # follow it; that reads better as the heading than as a paragraph.
            theme = THEME_RE.search(intro) if kind == "Casusscherm" else None
            if theme:
                # Such a screen has no task of its own, so neither does its
                # recording: it is the announcement read out loud.
                title, intro, media = f"Thema: {theme.group(1)}", "", None
            else:
                opgave_no += 1
                title = f"{kind or 'Opgave'} {opgave_no}"
                media = task_media(case, title, input_dir, output_dir)

            sections.append(
                {
                    "title": title,
                    "intro": intro,
                    "media": media,
                    "questions": [parse_question(ri) for ri in el.select(".ReviewItem")],
                }
            )

        elif "ReviewItem" in classes:
            if el.find_parent(class_="review-case"):
                continue  # already collected by its Opgave
            if not sections:
                sections.append({"title": "Vragen", "intro": "", "media": None, "questions": []})
            sections[-1]["questions"].append(parse_question(el))

    return sections


def parse_details(soup) -> list[tuple[str, str]]:
    """The "Details examensessie" card, minus the rows the export left blank."""
    details = []
    for row in soup.select(".exam-session-card .detail-row"):
        parts = [p for p in (t.strip() for t in row.stripped_strings) if p]
        if len(parts) < 2:
            continue
        label, value = parts[0].rstrip(":"), " ".join(parts[1:])
        if value in {"-", "", "0 min"}:
            continue
        details.append((label, value))
    return details


def score(sections: list[dict]) -> tuple[int, int]:
    right = total = 0
    for section in sections:
        for q in section["questions"]:
            total += 1
            correct = {o["label"] for o in q["options"] if o["correct"]}
            picked = {o["label"] for o in q["options"] if o["picked"]}
            if correct and correct == picked:
                right += 1
    return right, total


def answer_line(q: dict) -> str:
    correct = [o["label"] for o in q["options"] if o["correct"]]
    picked = [o["label"] for o in q["options"] if o["picked"]]
    ok = correct and picked and correct == picked
    parts = [f"**{q['title']}** — goed: {', '.join(correct) or '?'}"]
    if picked and not ok:
        parts.append(f"gekozen: {', '.join(picked)}")
    elif not picked:
        parts.append("niet beantwoord")
    return f"- {' · '.join(parts)} {'✅' if ok else '❌'}"


def render_media(media: dict) -> str:
    label = "Video" if media["kind"] == "video" else "Audio"
    duration = f" ({media['duration']})" if media["duration"] else ""
    return f"🔊 [{label}{duration}]({media['src']})"


def render(title: str, details, sections: list[dict]) -> str:
    right, total = score(sections)
    lines = [f"# {title}", ""]
    if details:
        lines += [" · ".join(f"{k}: {v}" for k, v in details), ""]
    lines += [f"**Score: {right} / {total}**", ""]

    for section in sections:
        lines += [f"## {section['title']}", ""]
        if section["intro"]:
            lines += [section["intro"], ""]
        if section["media"]:
            lines += [render_media(section["media"]), ""]

        for q in section["questions"]:
            lines += [f"### {q['title']}", ""]
            if q["text"]:
                lines += [q["text"], ""]
            for opt in q["options"]:
                lines.append(f"- {opt['label']} {opt['text']}".rstrip())
            lines.append("")

    lines += ["---", "", "## Antwoorden", ""]
    for section in sections:
        for q in section["questions"]:
            lines.append(answer_line(q))

    return "\n".join(lines).rstrip() + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("input", type=Path)
    ap.add_argument("output", type=Path)
    ap.add_argument("--title", help="heading of the file (default: output file name)")
    args = ap.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    soup = BeautifulSoup(args.input.read_text(encoding="utf-8"), "lxml")

    sections = parse_sections(
        soup, args.input.resolve().parent, args.output.resolve().parent
    )
    if not sections:
        print("No questions found.", file=sys.stderr)
        sys.exit(1)

    details = parse_details(soup)
    title = args.title or args.output.stem
    args.output.write_text(render(title, details, sections), encoding="utf-8")

    right, total = score(sections)
    print(
        f"{args.output}: {len(sections)} onderdelen, {total} vragen,"
        f" score {right}/{total}"
    )


if __name__ == "__main__":
    main()
