#!/usr/bin/env python3
"""Parse an exported "leestoets" review HTML page into per-task markdown files.

Usage: python3 parse_leestoets.py <input.html> <output_dir>

Each "Opgave" (task) in the HTML contains a reading text ("Casustekst") and one
or more multiple-choice questions ("Vraag N"). For each question we record the
options, which one was marked correct, and which one the user picked. A
markdown file is generated per Opgave.
"""

import re
import sys
from pathlib import Path

import os
from urllib.parse import quote, unquote

from bs4 import BeautifulSoup, NavigableString

# Set by main() so image src attributes can be rewritten to a path that's
# valid relative to the generated markdown files.
INPUT_HTML_DIR = None
OUTPUT_DIR = None


def render_img(node) -> str:
    src = node.get("src", "")
    alt = node.get("description") or node.get("alt") or ""
    if not src:
        return ""
    if INPUT_HTML_DIR is not None and OUTPUT_DIR is not None:
        asset_path = (INPUT_HTML_DIR / unquote(src)).resolve()
        src = os.path.relpath(asset_path, OUTPUT_DIR.resolve())
        src = quote(src)
    return f"![{alt}]({src})"


def normalize_inline(text: str) -> str:
    """Collapse insignificant whitespace from source formatting, keep explicit \n."""
    text = text.replace("\xa0", " ")
    # Collapse runs of spaces/tabs (but not the \n markers we inserted for <br>).
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return text


def wrap_style(inner: str, marker: str) -> str:
    """Wrap text in a markdown emphasis marker, re-wrapping per paragraph so
    the emphasis doesn't illegally span a blank line (source markup
    sometimes puts a paragraph break inside a single <strong>)."""
    paragraphs = [p.strip() for p in inner.split("\n\n")]
    wrapped = [f"{marker}{p}{marker}" for p in paragraphs if p]
    return "\n\n".join(wrapped)


def render_inline(node) -> str:
    """Render text + inline formatting (bold/italic/br), ignoring block structure."""
    parts = []
    for child in node.children:
        if isinstance(child, NavigableString):
            parts.append(str(child))
        elif child.name == "br":
            parts.append("\n")
        elif child.name in ("strong", "b"):
            inner = normalize_inline(render_inline(child)).strip()
            parts.append(wrap_style(inner, "**"))
        elif child.name in ("em", "i"):
            inner = normalize_inline(render_inline(child)).strip()
            parts.append(wrap_style(inner, "*"))
        elif child.name in ("script", "style"):
            continue
        elif child.name == "img":
            parts.append(render_img(child))
        elif child.name in ("ul", "ol", "table", "hr"):
            # Block-level content shouldn't normally appear where inline is
            # expected, but fall back to the block renderer if it does.
            parts.append("\n" + render_block(child) + "\n")
        else:
            parts.append(render_inline(child))
    return "".join(parts)


def render_list(node, depth: int = 0) -> str:
    ordered = node.name == "ol"
    lines = []
    index = 1
    indent = "  " * depth

    for child in node.children:
        if getattr(child, "name", None) in ("ul", "ol"):
            # Some markup nests a sub-list as a sibling of the preceding <li>
            # instead of inside it; treat it as belonging to that item.
            nested = render_list(child, depth + 1)
            if nested:
                lines.append(nested)
            continue
        if getattr(child, "name", None) != "li":
            continue

        li = child
        text_parts = []
        nested_lists = []
        for gc in li.children:
            if getattr(gc, "name", None) in ("ul", "ol"):
                nested_lists.append(render_list(gc, depth + 1))
            elif isinstance(gc, NavigableString):
                text_parts.append(str(gc))
            elif gc.name == "br":
                text_parts.append("\n")
            elif gc.name in ("strong", "b"):
                inner = normalize_inline(render_inline(gc)).strip()
                text_parts.append(wrap_style(inner, "**"))
            elif gc.name in ("em", "i"):
                inner = normalize_inline(render_inline(gc)).strip()
                text_parts.append(wrap_style(inner, "*"))
            else:
                text_parts.append(render_inline(gc))

        text = normalize_inline("".join(text_parts)).strip()
        bullet = f"{index}." if ordered else "-"
        index += 1
        sub_lines = text.split("\n") if text else [""]
        prefix = f"{indent}{bullet} "
        cont_indent = indent + " " * len(f"{bullet} ")
        rendered = [prefix + sub_lines[0]]
        for extra in sub_lines[1:]:
            rendered.append(cont_indent + extra if extra else "")
        lines.append("\n".join(rendered))

        for nested in nested_lists:
            lines.append(nested)

    return "\n".join(lines)


def render_table(node) -> str:
    tbody = node.find(["tbody"], recursive=False) or node
    rows = tbody.find_all("tr", recursive=False)

    grid = []
    for tr in rows:
        cells = tr.find_all(["td", "th"], recursive=False)
        grid.append(cells)

    # A table that's really just a single-cell styling wrapper (common in
    # this export) should be unwrapped rather than rendered as a 1x1 table.
    if len(grid) == 1 and len(grid[0]) == 1:
        return render_block(grid[0][0])

    if not grid:
        return ""

    n_cols = max(len(r) for r in grid)

    def cell_md(cell) -> str:
        rendered = render_block(cell).strip()
        rendered = rendered.replace("\n", "<br>")
        rendered = rendered.replace("|", "\\|")
        return rendered

    md_rows = []
    for cells in grid:
        row_text = [cell_md(c) for c in cells]
        row_text += [""] * (n_cols - len(row_text))
        md_rows.append("| " + " | ".join(row_text) + " |")

    header_sep = "| " + " | ".join(["---"] * n_cols) + " |"
    md_rows.insert(1, header_sep)
    return "\n".join(md_rows)


def render_block(node) -> str:
    """Render a node to markdown, honoring block-level structure."""
    blocks = []
    buffer = []

    def flush():
        if buffer:
            text = normalize_inline("".join(buffer)).strip()
            if text:
                blocks.append(text)
            buffer.clear()

    for child in node.children:
        if isinstance(child, NavigableString):
            buffer.append(str(child))
        elif child.name == "br":
            buffer.append("\n")
        elif child.name == "hr":
            flush()
            blocks.append("---")
        elif child.name in ("ul", "ol"):
            flush()
            rendered = render_list(child)
            if rendered:
                blocks.append(rendered)
        elif child.name == "table":
            flush()
            rendered = render_table(child)
            if rendered:
                blocks.append(rendered)
        elif child.name in ("strong", "b"):
            inner = normalize_inline(render_inline(child)).strip()
            if inner:
                buffer.append(wrap_style(inner, "**"))
        elif child.name in ("em", "i"):
            inner = normalize_inline(render_inline(child)).strip()
            if inner:
                buffer.append(wrap_style(inner, "*"))
        elif child.name in ("script", "style"):
            continue
        elif child.name == "img":
            flush()
            rendered = render_img(child)
            if rendered:
                blocks.append(rendered)
        elif child.name in ("div", "p", "span", "td", "th", "li"):
            flush()
            rendered = render_block(child)
            if rendered:
                blocks.append(rendered)
        else:
            buffer.append(render_inline(child))

    flush()
    return "\n\n".join(blocks)


def html_to_text(node) -> str:
    """Render a BeautifulSoup node to markdown, preserving lists/tables/bold."""
    if node is None:
        return ""
    text = render_block(node)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_question(review_item) -> dict:
    header = review_item.select_one(".question-header h5")
    title = header.get_text(strip=True) if header else "Vraag"

    item_text = review_item.select_one(".tt-item-text")
    question_text = html_to_text(item_text) if item_text else ""

    options = []
    for choice in review_item.select(".simple-choice"):
        opt_span = choice.select_one(".simple-choice-option")
        if not opt_span:
            continue
        label_el = opt_span.select_one(".answer-label")
        label = label_el.get_text(strip=True) if label_el else ""
        content_el = opt_span.select_one(".answer-content")
        content = html_to_text(content_el) if content_el else ""
        classes = opt_span.get("class", [])
        is_correct = "correct" in classes
        is_user_choice = "active" in classes
        options.append(
            {
                "label": label,
                "text": content,
                "is_correct": is_correct,
                "is_user_choice": is_user_choice,
            }
        )

    return {
        "title": title,
        "question": question_text,
        "options": options,
    }


def parse_opgave(opgave_table, index: int) -> dict:
    case_text_el = opgave_table.select_one(".case-text")
    case_text = html_to_text(case_text_el) if case_text_el else ""

    questions = [parse_question(ri) for ri in opgave_table.select(".ReviewItem")]

    return {
        "index": index,
        "case_text": case_text,
        "questions": questions,
    }


def find_opgave_tables(soup):
    opgaves = []
    for table in soup.select("table.review-case"):
        th = table.find("th")
        if not th:
            continue
        h5 = th.find("h5")
        if not h5 or h5.get_text(strip=True) != "Opgave":
            continue
        # Only keep top-level Opgave tables (skip nested "Casustekst" tables,
        # which also carry class review-case but are nested inside an Opgave).
        if table.find_parent("table", class_="review-case"):
            continue
        opgaves.append(table)
    return opgaves


def slugify(text: str, max_len: int = 40) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    text = re.sub(r"[\s_]+", "-", text).strip("-")
    return text[:max_len].rstrip("-") or "task"


def render_markdown(opgave: dict) -> str:
    lines = [f"# Opgave {opgave['index']}", ""]

    if opgave["case_text"]:
        lines.append("## Tekst")
        lines.append("")
        lines.append(opgave["case_text"])
        lines.append("")

    for q in opgave["questions"]:
        lines.append(f"## {q['title']}")
        lines.append("")
        if q["question"]:
            lines.append(q["question"])
            lines.append("")

        for opt in q["options"]:
            marks = []
            if opt["is_correct"]:
                marks.append("correct")
            if opt["is_user_choice"]:
                marks.append("user")
            mark_str = f"  _({', '.join(marks)})_" if marks else ""
            prefix = "- [x]" if opt["is_user_choice"] else "- [ ]"
            lines.append(f"{prefix} {opt['label']} {opt['text']}{mark_str}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.html> <output_dir>", file=sys.stderr)
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)

    global INPUT_HTML_DIR, OUTPUT_DIR
    INPUT_HTML_DIR = input_path.resolve().parent
    OUTPUT_DIR = output_dir

    soup = BeautifulSoup(input_path.read_text(encoding="utf-8"), "lxml")

    opgave_tables = find_opgave_tables(soup)
    if not opgave_tables:
        print("No Opgave tables found.", file=sys.stderr)
        sys.exit(1)

    for i, table in enumerate(opgave_tables, start=1):
        opgave = parse_opgave(table, i)
        first_q = opgave["questions"][0]["title"] if opgave["questions"] else f"opgave-{i}"
        filename = f"{i:02d}-{slugify(first_q)}.md"
        out_path = output_dir / filename
        out_path.write_text(render_markdown(opgave), encoding="utf-8")
        print(f"wrote {out_path}")

    print(f"\n{len(opgave_tables)} opgaven, output in {output_dir}")


if __name__ == "__main__":
    main()
