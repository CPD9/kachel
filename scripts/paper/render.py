#!/usr/bin/env python3
"""Renders the model paper to PDF and to one PNG per page, with headless Chromium.

  uv run --no-project --offline --with playwright python scripts/paper/render.py

Reads docs/paper/kachel-model.md (written by build.py), converts it to HTML with the small
converter below (headings, paragraphs, lists, pipe tables, images, inline marks; HTML lines pass
through), prints docs/paper/kachel-model.pdf on A4 and writes the pages as PNGs, 1600 px wide,
to $PAPER_PAGES (default ~/.cache/kachel/pitch/paper-pages) with pdftoppm.
"""

import html
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAPER = ROOT / "docs/paper"
MD = PAPER / "kachel-model.md"
PDF = PAPER / "kachel-model.pdf"
WORK = Path.home() / ".cache/kachel/tmp/paper"
PAGES = Path(os.environ.get("PAPER_PAGES", Path.home() / ".cache/kachel/pitch/paper-pages"))
CHROMIUM = os.environ.get("CHROMIUM", shutil.which("chromium") or "")
PAGE_WIDTH_PX = 1600

CSS = (Path(__file__).parent / "paper.css").read_text()


def inline(text):
    """Inline Markdown on a line that may already hold HTML."""
    parts = re.split(r"(`[^`]+`)", text)
    out = []
    for part in parts:
        if part.startswith("`") and part.endswith("`") and len(part) > 1:
            out.append(f"<code>{html.escape(part[1:-1])}</code>")
            continue
        part = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", part)
        part = re.sub(r"(?<![\w*])\*([^*\s][^*]*)\*(?![\w*])", r"<em>\1</em>", part)
        out.append(part)
    return "".join(out)


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def convert(md, base):
    lines = md.splitlines()
    out, i, in_refs = [], 0, False
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if not s or (s.startswith("<!--") and s.endswith("-->")):
            i += 1
            continue
        if s.startswith("<pre"):
            block = [line]
            while "</pre>" not in lines[i]:
                i += 1
                block.append(lines[i])
            out.append("\n".join(block))
            i += 1
            continue
        if s.startswith("<"):
            out.append(s)
            i += 1
            continue
        m = re.match(r"^(#{1,3}) (.*)", s)
        if m:
            level = len(m.group(1))
            if in_refs:
                out.append("</section>")
                in_refs = False
            if m.group(2) == "References":
                out.append('<section class="refs">')
                in_refs = True
            out.append(f"<h{level}>{inline(m.group(2))}</h{level}>")
            i += 1
            continue
        m = re.match(r"^!\[(.*)\]\((.*)\)$", s)
        if m:
            src = (base / m.group(2)).resolve().as_uri()
            cap = inline(html.escape(m.group(1), quote=False))
            out.append(f'<figure><img src="{src}" alt=""><figcaption>{cap}</figcaption></figure>')
            i += 1
            continue
        if s.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(cells(lines[i]))
                i += 1
            align = ["r" if c.endswith(":") else "l" for c in rows[1]]
            head = "".join(
                f'<th class="{a}">{inline(c)}</th>' for c, a in zip(rows[0], align, strict=True)
            )
            body = "".join(
                "<tr>"
                + "".join(
                    f'<td class="{a}">{inline(c)}</td>' for c, a in zip(r, align, strict=True)
                )
                + "</tr>"
                for r in rows[2:]
            )
            out.append(f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>")
            continue
        m = re.match(r"^(- |\d+\. )", s)
        if m:
            tag = "ul" if s.startswith("- ") else "ol"
            items = []
            while i < len(lines) and re.match(r"^(- |\d+\. )", lines[i].strip()):
                items.append(re.sub(r"^(- |\d+\. )", "", lines[i].strip()))
                i += 1
            body = "".join(
                f"<li>{inline(html.escape(t, quote=False) if in_refs else t)}</li>" for t in items
            )
            out.append(f"<{tag}>{body}</{tag}>")
            continue
        para = []
        while (
            i < len(lines)
            and lines[i].strip()
            and not re.match(r"^(#|\||!\[|<|- |\d+\. )", lines[i].strip())
        ):
            para.append(lines[i].strip())
            i += 1
        out.append(f"<p>{inline(' '.join(para))}</p>")
    if in_refs:
        out.append("</section>")
    return "\n".join(out)


def page_html(md):
    title = re.search(r"^# (.*)$", md, re.MULTILINE).group(1)
    body = convert(md, PAPER)
    return (
        '<!doctype html><html lang="en-GB"><head><meta charset="utf-8">'
        f"<title>{html.escape(title)}</title>"
        f"<style>{CSS}</style></head><body>{body}</body></html>"
    )


FOOTER = (
    "<div style=\"width:100%;font:8pt 'Noto Serif',serif;color:#444;text-align:center;\">"
    '<span class="pageNumber"></span></div>'
)


def main():
    from playwright.sync_api import sync_playwright

    if not CHROMIUM:
        sys.exit("render.py: no chromium found; set CHROMIUM to its path")
    WORK.mkdir(parents=True, exist_ok=True)
    page_file = WORK / "kachel-model.html"
    page_file.write_text(page_html(MD.read_text()))
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROMIUM, headless=True)
        try:
            page = browser.new_page()
            page.goto(page_file.as_uri(), wait_until="load")
            page.pdf(
                path=str(PDF),
                format="A4",
                print_background=True,
                prefer_css_page_size=True,
                display_header_footer=True,
                header_template="<span></span>",
                footer_template=FOOTER,
            )
        finally:
            browser.close()
    PAGES.mkdir(parents=True, exist_ok=True)
    for old in PAGES.glob("page-*.png"):
        old.unlink()
    subprocess.run(
        [
            "pdftoppm",
            "-png",
            "-scale-to-x",
            str(PAGE_WIDTH_PX),
            "-scale-to-y",
            "-1",
            str(PDF),
            str(PAGES / "page"),
        ],
        check=True,
    )
    pages = sorted(PAGES.glob("page-*.png"))
    print(f"wrote {PDF.relative_to(ROOT)} and {len(pages)} pages to {PAGES}")


if __name__ == "__main__":
    main()
