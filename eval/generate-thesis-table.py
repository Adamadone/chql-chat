"""Generate Table 3 XML for the thesis (LLM eval results) and splice it into document.xml.

One-shot script — meant to be run once for this overhaul. Not part of the eval pipeline.
"""
import re
import sys
from pathlib import Path

DOC = Path(r"C:\Users\adamz\AppData\Local\Temp\thesis-unpacked\word\document.xml")

# Data: (model_label, success, parse, equiv, kkeys, tool, resp_s, in_tok, out_tok, total_tok, cost_or_dash)
# Numeric fields are pre-formatted strings.
ROWS = [
    ("gpt-5.4",                                "0.96", "1.00", "1.00", "1.00", "0.80", "19.13",  "9271",  "198",  "9469",  "1.31"),
    ("gpt-5.5",                                "0.84", "1.00", "0.97", "1.00", "0.90", "21.64", "10077",  "160", "10237",  "2.76"),
    ("claude-haiku-4-5",                       "0.94", "1.00", "0.97", "1.00", "0.78", "19.23", "11863",  "245", "12108",  "0.65"),
    ("claude-sonnet-4-6",                      "0.92", "1.00", "0.97", "1.00", "0.82", "27.56", "12229",  "330", "12559",  "2.08"),
    ("claude-opus-4-7",                        "0.90", "1.00", "0.97", "1.00", "0.82", "23.88", "16637",  "307", "16944",  "4.54"),
    ("local/ministral-3-8b (full)",            "0.88", "1.00", "0.97", "0.97", "0.84", "24.90", "20169",  "450", "20619",  "—"),
    ("local/ministral-3-8b (composed)",        "0.86", "0.98", "0.91", "0.94", "0.80", "22.22", "17125",  "373", "17497",  "—"),
    ("local/nemotron-3-nano-4b (full)",        "0.78", "1.00", "0.86", "0.94", "0.82", "29.42", "35241",  "626", "35867",  "—"),
    ("local/nemotron-3-nano-4b (composed)",    "0.86", "1.00", "0.89", "0.91", "0.80", "25.61", "35156",  "519", "35675",  "—"),
    ("local/qwen3-4b-distilled (full)",        "0.82", "1.00", "0.83", "0.85", "0.70", "54.47", "16962",  "747", "17710",  "—"),
    ("local/qwen3-4b-distilled (composed)",    "0.84", "1.00", "0.80", "0.85", "0.66", "55.77", "15167",  "853", "16020",  "—"),
]

HEADERS = ["Model", "Success rate", "CHQL parse rate", "CHQL equivalence rate", "K-keys correct", "Tool usage rate", "Average response time (s)", "Average input tokens", "Average output tokens", "Average total tokens", "Total cost (USD)"]

# 11 columns. First column wider for model labels.
COL_WIDTHS = [1736, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800]
assert sum(COL_WIDTHS) == 9736, sum(COL_WIDTHS)
TBL_W = 9736


def header_cell(text: str, width: int, is_first: bool) -> str:
    cnf_first = '<w:cnfStyle w:val="001000000100" w:firstRow="0" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:oddVBand="0" w:evenVBand="0" w:oddHBand="0" w:evenHBand="0" w:firstRowFirstColumn="1" w:firstRowLastColumn="0" w:lastRowFirstColumn="0" w:lastRowLastColumn="0"/>'
    return (
        '<w:tc>'
        '<w:tcPr>'
        + (cnf_first if is_first else '')
        + f'<w:tcW w:w="{width}" w:type="dxa"/>'
        '<w:textDirection w:val="btLr"/>'
        '</w:tcPr>'
        '<w:p>'
        '<w:pPr>'
        '<w:ind w:left="113" w:right="113"/>'
        '<w:cnfStyle w:val="100000000000" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:oddVBand="0" w:evenVBand="0" w:oddHBand="0" w:evenHBand="0" w:firstRowFirstColumn="0" w:firstRowLastColumn="0" w:lastRowFirstColumn="0" w:lastRowLastColumn="0"/>'
        '<w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>'
        '</w:pPr>'
        f'<w:r><w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>{text}</w:t></w:r>'
        '</w:p>'
        '</w:tc>'
    )


def data_cell(text: str, width: int, is_first: bool, banded: bool) -> str:
    cnf_first = '<w:cnfStyle w:val="001000000000" w:firstRow="0" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:oddVBand="0" w:evenVBand="0" w:oddHBand="0" w:evenHBand="0" w:firstRowFirstColumn="0" w:firstRowLastColumn="0" w:lastRowFirstColumn="0" w:lastRowLastColumn="0"/>'
    return (
        '<w:tc>'
        '<w:tcPr>'
        + (cnf_first if is_first else '')
        + f'<w:tcW w:w="{width}" w:type="dxa"/>'
        '</w:tcPr>'
        '<w:p>'
        '<w:pPr><w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:color w:val="000000"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:pPr>'
        f'<w:r><w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:color w:val="000000"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>{text}</w:t></w:r>'
        '</w:p>'
        '</w:tc>'
    )


def build_table() -> str:
    out = []
    out.append('<w:tbl>')
    out.append('<w:tblPr>')
    out.append('<w:tblStyle w:val="PlainTable3"/>')
    out.append(f'<w:tblW w:w="{TBL_W}" w:type="dxa"/>')
    out.append('<w:tblLayout w:type="fixed"/>')
    out.append('<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>')
    out.append('</w:tblPr>')
    out.append('<w:tblGrid>')
    for w in COL_WIDTHS:
        out.append(f'<w:gridCol w:w="{w}"/>')
    out.append('</w:tblGrid>')

    # Header row
    out.append('<w:tr>')
    out.append('<w:trPr>')
    out.append('<w:cnfStyle w:val="100000000000" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:oddVBand="0" w:evenVBand="0" w:oddHBand="0" w:evenHBand="0" w:firstRowFirstColumn="0" w:firstRowLastColumn="0" w:lastRowFirstColumn="0" w:lastRowLastColumn="0"/>')
    out.append('<w:cantSplit/>')
    out.append('<w:trHeight w:val="1500"/>')
    out.append('</w:trPr>')
    for i, h in enumerate(HEADERS):
        out.append(header_cell(h, COL_WIDTHS[i], is_first=(i == 0)))
    out.append('</w:tr>')

    # Data rows
    for r_idx, row in enumerate(ROWS):
        banded = (r_idx % 2 == 0)
        band_cnf = ' w:rsidTr="00FD37B2"' if banded else ''
        out.append('<w:tr>')
        out.append('<w:trPr>')
        if banded:
            out.append('<w:cnfStyle w:val="000000100000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:oddVBand="0" w:evenVBand="0" w:oddHBand="1" w:evenHBand="0" w:firstRowFirstColumn="0" w:firstRowLastColumn="0" w:lastRowFirstColumn="0" w:lastRowLastColumn="0"/>')
        out.append('<w:trHeight w:val="288"/>')
        out.append('</w:trPr>')
        for i, v in enumerate(row):
            out.append(data_cell(v, COL_WIDTHS[i], is_first=(i == 0), banded=banded))
        out.append('</w:tr>')

    out.append('</w:tbl>')
    return '\n'.join(out)


def splice() -> None:
    content = DOC.read_text(encoding='utf-8')

    # Find Table 3 by locating the caption paragraph (paraId 5000F5D4) and then
    # the next <w:tbl>...</w:tbl> block after it.
    caption_marker = 'w14:paraId="5000F5D4"'
    caption_idx = content.find(caption_marker)
    if caption_idx < 0:
        sys.exit('caption marker not found')

    tbl_start = content.find('<w:tbl>', caption_idx)
    if tbl_start < 0:
        sys.exit('table start not found')

    tbl_end = content.find('</w:tbl>', tbl_start)
    if tbl_end < 0:
        sys.exit('table end not found')
    tbl_end += len('</w:tbl>')

    new_table = build_table()
    new_content = content[:tbl_start] + new_table + content[tbl_end:]
    DOC.write_text(new_content, encoding='utf-8')
    print(f'Replaced Table 3: was {tbl_end - tbl_start} bytes, now {len(new_table)} bytes')


if __name__ == '__main__':
    splice()
