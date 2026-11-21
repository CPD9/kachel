"""A small Markdown-to-image renderer for showing the repo's docs as pages in the film:
headings, paragraphs, lists, tables, code blocks and images. Inline markup is dropped."""

import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from style import FONT_DIR, INK, PAPER, SLATE, WEIGHTS, WORK

GRID = (0xE6, 0xE2, 0xDC)


def _font(size, weight="regular"):
    return ImageFont.truetype(str(FONT_DIR / WEIGHTS[weight]), size)


def inline(text):
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<(https?://)?([^/>]+)[^>]*>", r"\2", text)
    text = re.sub(r"<[^>]+>", "", text)
    return text.replace("**", "").replace("`", "").replace("\\|", "|").strip()


def _wrap(d, text, f, width):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if d.textlength(trial, font=f) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    return lines + ([line] if line else [])


def render(md_path, width=1200, margin=80, max_height=16000):
    """The Markdown file as one tall PAPER page, cached in the work folder."""
    md_path = Path(md_path)
    cache = WORK / f"page_{md_path.parent.name}_{md_path.stem}_{width}.png"
    if cache.exists() and cache.stat().st_mtime > md_path.stat().st_mtime:
        return Image.open(cache).convert("RGB")
    page = Image.new("RGB", (width, max_height), PAPER)
    d = ImageDraw.Draw(page)
    inner = width - 2 * margin
    y = margin
    lines = md_path.read_text().splitlines()
    i = 0
    body = _font(26)
    while i < len(lines) and y < max_height - 400:
        raw = lines[i]
        line = raw.strip()
        if line.startswith("```"):
            j = i + 1
            block = []
            while j < len(lines) and not lines[j].strip().startswith("```"):
                block.append(lines[j])
                j += 1
            f = _font(22, "mono")
            h = 30 * len(block) + 30
            d.rounded_rectangle([margin, y, width - margin, y + h], radius=8, fill=GRID)
            for k, b in enumerate(block):
                d.text((margin + 20, y + 15 + 30 * k), b[:90], font=f, fill=INK)
            y += h + 24
            i = j + 1
            continue
        if line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [inline(c) for c in re.split(r"(?<!\\)\|", lines[i].strip())[1:-1]]
                if not all(re.fullmatch(r":?-+:?", c.replace(" ", "")) for c in cells if c):
                    rows.append(cells)
                i += 1
            if not rows:
                continue
            n = max(len(r) for r in rows)
            f, fb = _font(21), _font(21, "bold")
            lens = [max(len(r[c]) if c < len(r) else 0 for r in rows) + 4 for c in range(n)]
            ws = [inner * v / sum(lens) for v in lens]
            for r, row in enumerate(rows):
                cell_lines = [
                    _wrap(d, row[c] if c < len(row) else "", fb if r == 0 else f, ws[c] - 16) for c in range(n)
                ]
                h = 28 * max(len(cl) for cl in cell_lines) + 16
                x = margin
                for c in range(n):
                    for k, cl in enumerate(cell_lines[c]):
                        d.text((x + 8, y + 8 + 28 * k), cl, font=fb if r == 0 else f, fill=INK)
                    x += ws[c]
                y += h
                d.line([margin, y, width - margin, y], fill=GRID, width=2)
            y += 24
            continue
        m = re.match(r"!\[[^\]]*\]\(([^)]+)\)", line)
        if m:
            p = md_path.parent / m.group(1)
            if p.exists() and p.suffix.lower() in (".png", ".webp", ".jpg", ".gif"):
                im = Image.open(p).convert("RGB")
                im = im.resize((inner, int(im.height * inner / im.width)), Image.LANCZOS)
                page.paste(im, (margin, y))
                y += im.height + 28
            i += 1
            continue
        h = re.match(r"(#+) (.*)", line)
        if h:
            level = len(h.group(1))
            f = _font({1: 56, 2: 40, 3: 32}.get(level, 28), "bold")
            y += 18 if level > 1 else 0
            for ln in _wrap(d, inline(h.group(2)), f, inner):
                d.text((margin, y), ln, font=f, fill=INK)
                y += int(f.size * 1.3)
            if level <= 2:
                d.line([margin, y + 4, width - margin, y + 4], fill=GRID, width=2)
                y += 16
            i += 1
            continue
        if not line or line.startswith("<") and line.endswith(">") and not inline(line):
            i += 1
            continue
        bullet = re.match(r"([-*]|\d+\.) (.*)", line)
        para = [bullet.group(2) if bullet else line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"([-*]|\d+\.) |#|\||```|!\[", lines[i].strip()):
            para.append(lines[i].strip())
            i += 1
        text = inline(" ".join(para))
        x = margin + (34 if bullet else 0)
        if bullet:
            d.text((margin + 6, y), "•" if bullet.group(1) in "-*" else bullet.group(1), font=body, fill=SLATE)
        for ln in _wrap(d, text, body, inner - (x - margin)):
            d.text((x, y), ln, font=body, fill=INK)
            y += 38
        y += 14
    page = page.crop((0, 0, width, min(y + margin, max_height)))
    WORK.mkdir(parents=True, exist_ok=True)
    page.save(cache)
    return page
