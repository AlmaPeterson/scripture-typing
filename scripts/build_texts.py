"""Build public/texts/ from the raw downloads in raw/.

    npm run texts:download   # once, fetches the sources into raw/
    npm run texts:build      # writes public/texts/**.json
    npm run texts:check      # validates the output

Sources, editions and licenses are documented in docs/TEXTS.md.

Only the scripture text itself is written: no chapter headings or summaries,
section introductions, footnotes, cross-references or other study helps.
"""

from __future__ import annotations

import json
import re
import shutil
import sqlite3
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
OUT = ROOT / "public" / "texts"

# --------------------------------------------------------------------------
# Library layout
# --------------------------------------------------------------------------

# Courses in the library, in canonical order. Each volume of scripture is a
# course; a course holds one or more books.
COURSES = [
    ("old-testament", "Old Testament"),
    ("new-testament", "New Testament"),
    ("book-of-mormon", "Book of Mormon"),
    ("doctrine-and-covenants", "Doctrine and Covenants"),
    ("pearl-of-great-price", "Pearl of Great Price"),
    ("lectures-on-faith", "Lectures on Faith"),
    ("jst-old-testament", "Joseph Smith Translation: Old Testament"),
    ("jst-new-testament", "Joseph Smith Translation: New Testament"),
]

# Titles that differ from the source database, or need a cleaner id.
TITLE_OVERRIDES = {
    "Joseph Smith--Matthew": "Joseph Smith—Matthew",
    "Joseph Smith--History": "Joseph Smith—History",
    "Solomon's Song": "Song of Solomon",
}
LDS_VOLUME_IDS = {
    1: "old-testament",
    2: "new-testament",
    3: "book-of-mormon",
    4: "doctrine-and-covenants",
    5: "pearl-of-great-price",
}

# Words printed in capitals at the start of a chapter only as typography
# ("IN the beginning"). LORD in capitals is the KJV rendering of the divine
# name and is kept.
KEEP_CAPS = {"LORD", "GOD", "I", "O", "A"}
OPENING_NAMES = {"ISRAEL"}
# Words printed in small caps after a one-letter chapter opening ("I WILL").
RUN_ON_CAPS = {
    "AM", "BESEECH", "CHARGE", "CLAP", "COME", "COMMEND", "CRIED", "EXHORT", "FALSE",
    "FOOLISH", "GIVE", "GOOD", "GREAT", "HEARKEN", "LIFTED", "LOVE", "PRAISE", "PRAYER",
    "REVELATION", "SAID", "SAW", "SAY", "SING", "SOFT", "THEREFORE", "WAITED", "WAS",
    "WILL", "WISE", "YE",
}

# Errors in the source data: (book title, chapter, verse) -> (wrong, right).
SOURCE_FIXES = {
    # The source drops "was eight years old when he" (KJV 2 Chronicles 34:1).
    ("2 Chronicles", 34, 1): ("JOSIAHbegan", "JOSIAH was eight years old when he began"),
    # A heading in small caps; printed today as "A Word of Wisdom".
    ("Doctrine and Covenants", 89, 1): ("A WORD OF WISDOM", "A Word of Wisdom"),
}


def slug(title: str) -> str:
    s = title.lower().replace("—", "-").replace("--", "-").replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def tidy(text: str) -> str:
    """Normalise whitespace and the double-hyphen dash used by the sources.

    Stored text keeps typographic characters (em dashes etc.); the app converts
    them to plain keyboard characters at typing time."""
    text = text.replace("--", "—")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def opening_caps(text: str) -> str:
    """'IN the beginning' -> 'In the beginning' (chapter-opening small caps).

    After a one-letter first word the small caps run on: 'I WILL extol',
    'O GIVE thanks', 'A GREAT and marvelous work', 'I, THE Lord'.
    """
    m = re.match(r"^([A-Z][A-Z']+)\b", text)
    if m and m.group(1) not in KEEP_CAPS and len(m.group(1)) > 1:
        word = m.group(1)
        return word[0] + word[1:].lower() + text[len(word):]
    m = re.match(r"^((?:[AIO]|Oh),? )((?:[A-Z][A-Z']+\b ?)+)", text)
    if m:
        words = m.group(2).split(" ")
        caps = " ".join(opening_word(w) for w in words)
        return m.group(1) + caps + text[m.end() :]
    # The JST text can have these as "I Exhort", "A Good name".
    m = re.match(r"^((?:[AIO]|Oh),? )([A-Z][a-z]+)\b", text)
    if m and m.group(2).upper() in RUN_ON_CAPS:
        return m.group(1) + m.group(2).lower() + text[m.end() :]
    return text


def opening_word(word: str) -> str:
    if word in KEEP_CAPS:
        return word
    return word.capitalize() if word in OPENING_NAMES else word.lower()


def book_file(volume: str, book_id: str, title: str, unit_label: str, chapters: list[dict]) -> dict:
    return {
        "id": book_id,
        "title": title,
        "volume": volume,
        "unitLabel": unit_label,
        "chapters": chapters,
    }


# --------------------------------------------------------------------------
# KJV, Book of Mormon, D&C, Pearl of Great Price
# --------------------------------------------------------------------------


def load_lds_scriptures() -> dict[str, list[dict]]:
    db_path = RAW / "lds-scriptures" / "lds-scriptures-sqlite3.db"
    db = sqlite3.connect(f"file:{urllib.parse.quote(str(db_path))}?mode=ro", uri=True)
    rows = db.execute(
        "SELECT volume_id, book_id, book_title, chapter_number, verse_number, scripture_text "
        "FROM scriptures ORDER BY volume_id, book_id, chapter_number, verse_number"
    ).fetchall()
    volumes: dict[str, list[dict]] = {}
    books: dict[int, dict] = {}
    for vol_id, book_id, title, ch, vn, text in rows:
        volume = LDS_VOLUME_IDS[vol_id]
        if book_id not in books:
            title = TITLE_OVERRIDES.get(title, title)
            unit = "Section" if volume == "doctrine-and-covenants" else "Chapter"
            bid = "doctrine-and-covenants" if volume == "doctrine-and-covenants" else slug(title)
            books[book_id] = book_file(volume, bid, title, unit, [])
            volumes.setdefault(volume, []).append(books[book_id])
        chapters = books[book_id]["chapters"]
        if not chapters or chapters[-1]["number"] != ch:
            chapters.append({"number": ch, "verses": []})
        text = tidy(text)
        fix = SOURCE_FIXES.get((title, ch, vn))
        if fix:
            assert fix[0] in text, (title, ch, vn)
            text = text.replace(*fix)
        if vn == 1:
            text = opening_caps(text)
        chapters[-1]["verses"].append({"number": vn, "text": text})
    return volumes


# --------------------------------------------------------------------------
# Lectures on Faith
# --------------------------------------------------------------------------

ORDINALS = ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH", "SEVENTH"]


def unitalic(text: str) -> str:
    """Project Gutenberg marks italics as _word_; drop the markers."""
    return re.sub(r"(?<![A-Za-z0-9])_([^_]+)_(?![A-Za-z0-9])", r"\1", text)


def load_lectures_on_faith() -> dict:
    """Numbered paragraphs of the seven lectures (Project Gutenberg #56684).

    The question-and-answer review sections that follow some lectures are not
    numbered paragraphs and are left out (see docs/TEXTS.md)."""
    text = (RAW / "gutenberg-56684" / "pg56684.txt").read_text(encoding="utf-8")
    text = text.replace("\r\n", "\n")
    start = text.index("*** START OF THE PROJECT GUTENBERG EBOOK")
    end = text.index("*** END OF THE PROJECT GUTENBERG EBOOK")
    body = text[start:end].split("\n", 1)[1]
    parts = re.split(r"^LECTURE (" + "|".join(ORDINALS) + r")\.?\s*$", body, flags=re.M)
    lectures = []
    for i in range(1, len(parts), 2):
        number = ORDINALS.index(parts[i]) + 1
        blocks = [b.strip() for b in re.split(r"\n\s*\n", parts[i + 1]) if b.strip()]
        paragraphs: list[dict] = []
        for block in blocks:
            m = re.match(r"^(\d+)\.\s+(.*)$", block, flags=re.S)
            if m and int(m.group(1)) == len(paragraphs) + 1:
                paragraphs.append({"number": int(m.group(1)), "text": unitalic(tidy(m.group(2)))})
            elif block.startswith(("Q.", "A.", "_Question_", "OF THEOLOGY", "Transcriber's Note")):
                break  # the review questions (or end notes) start; the lecture text is over
            elif paragraphs and not re.match(r"^(Section|SECTION|Of Faith|On the Doctrine|Latter Day)", block):
                # A quotation or continuation that belongs to the paragraph.
                paragraphs[-1]["text"] += " " + unitalic(tidy(block))
        lectures.append({"number": number, "verses": paragraphs})
    return book_file("lectures-on-faith", "lectures-on-faith", "Lectures on Faith", "Lecture", lectures)


# --------------------------------------------------------------------------
# Joseph Smith Translation (1867 Inspired Version)
# --------------------------------------------------------------------------


def load_jst(lds: dict[str, list[dict]]) -> dict[str, list[dict]]:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import jst_build  # noqa: E402  (kept separate; it is large)

    return jst_build.build(lds, RAW, opening_caps, tidy, book_file, slug)


# --------------------------------------------------------------------------


def write(volumes: dict[str, list[dict]]) -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    index = {"courses": []}
    for vid, vtitle in COURSES:
        books = volumes.get(vid, [])
        if not books:
            continue
        (OUT / vid).mkdir(parents=True, exist_ok=True)
        entries = []
        for book in books:
            path = OUT / vid / f"{book['id']}.json"
            path.write_text(json.dumps(book, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
            entry = {
                "id": book["id"],
                "title": book["title"],
                "unitLabel": book["unitLabel"],
                "chapters": len(book["chapters"]),
                "path": f"texts/{vid}/{book['id']}.json",
            }
            if book.get("draft"):
                entry["draft"] = True
            entries.append(entry)
        index["courses"].append({"id": vid, "title": vtitle, "books": entries})
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    volumes = load_lds_scriptures()
    volumes["lectures-on-faith"] = [load_lectures_on_faith()]
    if "--no-jst" not in sys.argv and (Path(__file__).parent / "jst_build.py").exists():
        volumes.update(load_jst(volumes))
    write(volumes)
    total = sum(len(b) for b in volumes.values())
    print(f"wrote {total} books to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
