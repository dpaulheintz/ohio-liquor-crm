#!/usr/bin/env python3
"""Render the OSU game-day markdown report into a styled PDF with reportlab.

Purpose-built for the structure this report uses: #/##/### headings, GFM
tables, '-'/'1.' lists (with 2-space indented sub-bullets), '>' blockquotes,
'---' rules, **bold**, and `code`. Not a general markdown engine.
"""
import re
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, ListFlowable, ListItem,
)

SRC = sys.argv[1] if len(sys.argv) > 1 else "reports/osu-gameday-2025.md"
OUT = sys.argv[2] if len(sys.argv) > 2 else "reports/osu-gameday-2025.pdf"

GREEN = colors.HexColor("#C8102E")   # OHLQ red accent used across the app
DARK = colors.HexColor("#1a1a1a")
GREY = colors.HexColor("#6B7280")
LIGHT = colors.HexColor("#F3F4F6")
BORDER = colors.HexColor("#D1D5DB")

styles = getSampleStyleSheet()
def mk(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=DARK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, parent=styles["Normal"], **base)

BODY = mk("body", spaceAfter=6)
H1 = mk("h1", fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=DARK, spaceBefore=4, spaceAfter=8)
H2 = mk("h2", fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=GREEN, spaceBefore=14, spaceAfter=6)
H3 = mk("h3", fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=DARK, spaceBefore=8, spaceAfter=3)
QUOTE = mk("quote", fontSize=9, leading=12.5, textColor=colors.HexColor("#374151"),
           leftIndent=10, backColor=LIGHT, borderPadding=(7, 7, 7, 9), spaceAfter=8)
CELL = mk("cell", fontSize=8, leading=10.5)
CELL_R = mk("cellr", fontSize=8, leading=10.5, alignment=2)
CELL_H = mk("cellh", fontName="Helvetica-Bold", fontSize=8, leading=10.5, textColor=colors.white)
CELL_HR = mk("cellhr", fontName="Helvetica-Bold", fontSize=8, leading=10.5, textColor=colors.white, alignment=2)


def inline(text):
    """Convert **bold**, `code`, and escape XML for reportlab Paragraph markup."""
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r'<font face="Courier" size="8.5">\1</font>', text)
    # em dashes / arrows already unicode-safe in Helvetica
    return text


def split_row(line):
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    return cells


def build():
    with open(SRC, encoding="utf-8") as f:
        lines = f.read().split("\n")

    story = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()

        # Horizontal rule
        if stripped == "---":
            story.append(Spacer(1, 4))
            story.append(HRFlowable(width="100%", thickness=0.6, color=BORDER))
            story.append(Spacer(1, 4))
            i += 1
            continue

        # Headings
        if stripped.startswith("### "):
            story.append(Paragraph(inline(stripped[4:]), H3)); i += 1; continue
        if stripped.startswith("## "):
            story.append(Paragraph(inline(stripped[3:]), H2)); i += 1; continue
        if stripped.startswith("# "):
            story.append(Paragraph(inline(stripped[2:]), H1)); i += 1; continue

        # Blockquote (may span multiple '>' lines)
        if stripped.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip().lstrip(">").strip())
                i += 1
            story.append(Paragraph(inline(" ".join(buf)), QUOTE))
            continue

        # Table (header row followed by a |---| separator)
        if stripped.startswith("|") and i + 1 < n and re.match(r"^\|[\s:\-|]+\|$", lines[i + 1].strip()):
            aligns_raw = split_row(lines[i + 1])
            aligns = []
            for a in aligns_raw:
                if a.startswith(":") and a.endswith(":"):
                    aligns.append("C")
                elif a.endswith(":"):
                    aligns.append("R")
                else:
                    aligns.append("L")
            header = split_row(lines[i])
            i += 2
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i])); i += 1

            def cellpara(txt, al, head=False):
                if head:
                    st = CELL_HR if al in ("R", "C") else CELL_H
                else:
                    st = CELL_R if al == "R" else (mk("cc", fontSize=8, leading=10.5, alignment=1) if al == "C" else CELL)
                return Paragraph(inline(txt), st)

            data = [[cellpara(h, aligns[j] if j < len(aligns) else "L", head=True) for j, h in enumerate(header)]]
            for r in rows:
                data.append([cellpara(c, aligns[j] if j < len(aligns) else "L") for j, c in enumerate(r)])

            tbl = Table(data, repeatRows=1, hAlign="LEFT")
            ts = [
                ("BACKGROUND", (0, 0), (-1, 0), DARK),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
                ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 3.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ]
            tbl.setStyle(TableStyle(ts))
            story.append(tbl)
            story.append(Spacer(1, 8))
            continue

        # Numbered list item (may have indented sub-bullets on following lines)
        m_num = re.match(r"^(\d+)\.\s+(.*)", stripped)
        if m_num:
            story.append(Paragraph("<b>%s.</b> %s" % (m_num.group(1), inline(m_num.group(2))),
                                   mk("li", spaceAfter=3, leftIndent=16, firstLineIndent=-16)))
            i += 1
            # indented sub-bullets ("   - ...")
            while i < n and re.match(r"^\s{2,}-\s+", lines[i]):
                sub = re.sub(r"^\s*-\s+", "", lines[i])
                story.append(Paragraph("•&nbsp; " + inline(sub),
                                       mk("subli", fontSize=9, leading=12.5, leftIndent=30, firstLineIndent=-10, spaceAfter=2)))
                i += 1
            continue

        # Bullet list item
        if re.match(r"^-\s+", stripped):
            txt = re.sub(r"^-\s+", "", stripped)
            story.append(Paragraph("•&nbsp; " + inline(txt),
                                   mk("bul", leftIndent=14, firstLineIndent=-10, spaceAfter=3)))
            i += 1
            continue

        # Blank line
        if stripped == "":
            i += 1
            continue

        # Plain paragraph (italic footer if wrapped in *...*)
        if stripped.startswith("*") and stripped.endswith("*") and not stripped.startswith("**"):
            story.append(Paragraph("<i>%s</i>" % inline(stripped.strip("*")),
                                   mk("foot", fontSize=8.5, textColor=GREY, spaceBefore=4)))
            i += 1
            continue

        story.append(Paragraph(inline(stripped), BODY))
        i += 1

    doc = SimpleDocTemplate(OUT, pagesize=letter,
                            leftMargin=0.7 * inch, rightMargin=0.7 * inch,
                            topMargin=0.6 * inch, bottomMargin=0.6 * inch,
                            title="OSU Game Day Restaurant Analysis 2025")
    doc.build(story)
    print("wrote", OUT)


if __name__ == "__main__":
    build()
