"""Validate public/texts/ after a build.

Checks:
- index.json lists every book file, in order, and every file is listed
- book counts per volume and chapter counts per book match the canon
- chapters and verses are numbered 1, 2, 3, ... with no gaps
- no empty verses
- no leftover HTML, markup, footnote markers or source artefacts

Exits non-zero if anything fails. Prints a summary table either way.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEXTS = ROOT / "public" / "texts"

EXPECTED_BOOKS = {
    "old-testament": 39,
    "new-testament": 27,
    "book-of-mormon": 15,
    "doctrine-and-covenants": 1,  # sections 1-138
    "pearl-of-great-price": 5,
    "lectures-on-faith": 1,
    "jst-old-testament": 38,  # the Inspired Version has no Song of Solomon
    "jst-new-testament": 27,
}

KJV_CHAPTERS = [
    50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8,
    66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4,  # Old Testament
    28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22,  # New
]
EXPECTED_CHAPTERS = {
    "book-of-mormon": [22, 33, 7, 1, 1, 1, 1, 29, 63, 16, 30, 1, 9, 15, 10],
    "doctrine-and-covenants": [138],
    "pearl-of-great-price": [8, 5, 1, 1, 1],
    "lectures-on-faith": [7],
}
EXPECTED_VERSE_COUNTS = {
    # A few spot checks of well-known verse counts.
    ("old-testament", "genesis", 1): 31,
    ("old-testament", "psalms", 119): 176,
    ("new-testament", "john", 3): 36,
    ("book-of-mormon", "alma", 32): 43,
    ("doctrine-and-covenants", "doctrine-and-covenants", 76): 119,
    ("doctrine-and-covenants", "doctrine-and-covenants", 138): 60,
    ("pearl-of-great-price", "articles-of-faith", 1): 13,
    ("lectures-on-faith", "lectures-on-faith", 2): 56,
}

BAD_PATTERNS = {
    "HTML tag": re.compile(r"</?[a-zA-Z][^>]*>"),
    "HTML entity": re.compile(r"&[a-zA-Z]+;|&#\d+;"),
    "wiki/template markup": re.compile(r"\{\{|\}\}|\[\[|\]\]|''"),
    "footnote marker": re.compile(r"\[\d{1,3}\]|\[[a-z]\]|(?<=[a-z])[¹²³⁴⁵⁶⁷⁸⁹⁰]|\*\d|†|‡"),
    "paragraph reference": re.compile(r"[§¶]"),
    "digit in text": re.compile(r"\d"),
    "Gutenberg boilerplate": re.compile(r"Gutenberg", re.I),
    "underscore emphasis": re.compile(r"_\w"),
    "double space": re.compile(r"  "),
    "leading/trailing space": re.compile(r"^\s|\s$"),
    "control character": re.compile(r"[\x00-\x08\x0b-\x1f\x7f]"),
}
# Digits legitimately appear in a few texts (dates in D&C and the Pearl of
# Great Price, "Buck's ... page 582" in the Lectures on Faith).
DIGITS_ALLOWED = {"doctrine-and-covenants", "pearl-of-great-price", "lectures-on-faith"}


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    index = json.loads((TEXTS / "index.json").read_text(encoding="utf-8"))
    listed = set()

    print(f"{'course':26} {'books':>5}  chapters per book")
    for vol in index["courses"]:
        vid = vol["id"]
        draft_volume = vid.startswith("jst-")
        books = vol["books"]
        drafts = sum(1 for b in books if b.get("draft"))
        exp = EXPECTED_BOOKS.get(vid)
        if exp is not None and len(books) != exp:
            errors.append(f"{vid}: {len(books)} books, expected {exp}")
        counts = []
        for bi, entry in enumerate(books):
            path = ROOT / "public" / entry["path"]
            listed.add(path.resolve())
            book = json.loads(path.read_text(encoding="utf-8"))
            where = f"{vid}/{book['id']}"
            for key in ("id", "title", "volume", "unitLabel", "chapters"):
                if key not in book:
                    errors.append(f"{where}: missing '{key}'")
            if book["volume"] != vid or book["id"] != entry["id"]:
                errors.append(f"{where}: id/volume do not match index.json")
            n_ch = len(book["chapters"])
            counts.append(f"{book['title']} {n_ch}")
            if entry["chapters"] != n_ch:
                errors.append(f"{where}: index says {entry['chapters']} chapters, file has {n_ch}")
            expected = None
            if vid in ("old-testament", "new-testament"):
                expected = KJV_CHAPTERS[bi + (39 if vid == "new-testament" else 0)]
            elif vid in EXPECTED_CHAPTERS and bi < len(EXPECTED_CHAPTERS[vid]):
                expected = EXPECTED_CHAPTERS[vid][bi]
            if expected is not None and n_ch != expected:
                errors.append(f"{where}: {n_ch} chapters, expected {expected}")
            # Draft JST books are known to need proofreading: report their
            # problems as warnings. Everything else must be clean.
            report = warnings if (draft_volume and entry.get("draft")) else errors
            for ci, ch in enumerate(book["chapters"], 1):
                if ch["number"] != ci:
                    report.append(f"{where}: chapter {ch['number']} found where {ci} expected")
                if not ch["verses"]:
                    report.append(f"{where} {ch['number']}: no verses")
                for vi, verse in enumerate(ch["verses"], 1):
                    ref = f"{where} {ch['number']}:{verse['number']}"
                    if verse["number"] != vi:
                        report.append(f"{ref}: verse number out of sequence (expected {vi})")
                    text = verse["text"]
                    if not text.strip():
                        report.append(f"{ref}: empty verse")
                    for name, pattern in BAD_PATTERNS.items():
                        if name == "digit in text" and vid in DIGITS_ALLOWED:
                            continue
                        if pattern.search(text):
                            report.append(f"{ref}: {name}: {text[:80]!r}")
                key = (vid, book["id"], ch["number"])
                if key in EXPECTED_VERSE_COUNTS and len(ch["verses"]) != EXPECTED_VERSE_COUNTS[key]:
                    errors.append(f"{where} {ch['number']}: {len(ch['verses'])} verses, expected {EXPECTED_VERSE_COUNTS[key]}")
        print(f"{vid:26} {len(books):5}  " + ", ".join(counts))
        if drafts:
            print(f"{'':26} {'':5}  ({drafts} of {len(books)} marked draft)")

    on_disk = {p.resolve() for p in TEXTS.rglob("*.json") if p.name != "index.json"}
    for p in sorted(on_disk - listed):
        errors.append(f"{p.relative_to(ROOT)}: not listed in index.json")

    total_verses = 0
    for p in on_disk:
        total_verses += sum(len(c["verses"]) for c in json.loads(p.read_text(encoding="utf-8"))["chapters"])
    print(f"\n{len(on_disk)} book files, {total_verses:,} verses/paragraphs")
    if warnings:
        print(f"\n{len(warnings)} warning(s) in draft volumes (first 20):")
        for w in warnings[:20]:
            print(f"  {w}")
    if errors:
        print(f"\n{len(errors)} error(s) (first 50):")
        for e in errors[:50]:
            print(f"  {e}")
        return 1
    print("\nall checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
