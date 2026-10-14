"""Build the Joseph Smith Translation volumes from the two 1867 OCR scans.

Called by build_texts.py. The OCR parsing and alignment live in jst_ocr.py;
this module runs them over both scans, merges the results chapter by chapter
and writes a proofreading report to docs/JST-STATUS.md.
"""

from __future__ import annotations

import collections
import difflib
import re
from pathlib import Path

import jst_ocr as J

SCANS = [
    ("toronto", "ia-holyscripturestr00smituoft/holyscripturestr00smituoft_djvu.txt"),
    ("byu", "ia-holyscriptures00smit/holyscriptures00smit_djvu.txt"),
]
REPORT = Path(__file__).resolve().parent.parent / "docs" / "JST-STATUS.md"
LONG_VERSE_WORDS = 160  # longer than any KJV verse (Esther 8:9 has 90 words); means merged verses


def build(lds: dict, raw: Path, opening_caps, tidy, book_file, slug) -> dict[str, list[dict]]:
    # Reference texts and a vocabulary from every other scripture text.
    vocab: collections.Counter[str] = collections.Counter()
    forms: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    for books in lds.values():
        for book in books:
            for ch in book["chapters"]:
                for v in ch["verses"]:
                    for w in re.split(r"[\s—]+", v["text"]):
                        n = J.norm(w)
                        if n:
                            vocab[n] += 1
                            forms[n][w.strip(".,;:?!()'\"[]")] += 1
    # Words checked by hand against the scans that appear in no other text.
    extra = Path(__file__).resolve().parent / "jst_words.txt"
    for line in extra.read_text(encoding="utf-8").splitlines() if extra.exists() else []:
        w = line.split("#")[0].strip()
        if w:
            vocab[J.norm(w)] += 1
            forms[J.norm(w)][w] += 1
    fixer = J.Fixer(dict(vocab), {n: c.most_common(1)[0][0] for n, c in forms.items()})

    by_title = {(vid, b["title"]): b for vid, books in lds.items() for b in books}
    bible = [(vid, b) for vid in ("old-testament", "new-testament") for b in lds[vid] if b["id"] != "song-of-solomon"]

    def chapters_of(book: dict, source: str) -> list[tuple[str, int, list[tuple[int, str]]]]:
        return [(source, c["number"], [(v["number"], v["text"]) for v in c["verses"]]) for c in book["chapters"]]

    refs = []
    for vid, book in bible:
        chs = chapters_of(book, "kjv")
        if book["id"] == "genesis":
            moses = by_title[("pearl-of-great-price", "Moses")]
            chs = [c for c in chapters_of(moses, "moses") if c[1] >= 2] + chs
        if book["id"] == "matthew":
            jsm = by_title[("pearl-of-great-price", "Joseph Smith—Matthew")]
            chs = chs[:23] + chapters_of(jsm, "js-m") + chs[23:]
        refs.append(J.ref_words(chs))

    # Rebuild every book from each scan.
    results: dict[str, list[list[J.BuiltChapter] | None]] = {}
    for name, rel in SCANS:
        text = (raw / rel).read_text(encoding="utf-8", errors="replace")
        toks = J.tokenize(text, J.scripture_start(text))
        starts = J.find_book_starts(toks, refs)
        out: list[list[J.BuiltChapter] | None] = []
        for k, ref in enumerate(refs):
            s = starts[k]
            if s is None:
                out.append(None)
                continue
            e = next((x for x in starts[k + 1 :] if x is not None), len(toks))
            out.append(J.build_book(toks[s:e], ref, fixer))
        results[name] = out

    volumes: dict[str, list[dict]] = {"jst-old-testament": [], "jst-new-testament": []}
    report_rows = []
    for k, (vid, kjv_book) in enumerate(bible):
        a, b = results["toronto"][k], results["byu"][k]
        kjv_counts = {c["number"]: len(c["verses"]) for c in kjv_book["chapters"]}
        chapters, notes = merge(a, b, fixer, kjv_counts)
        out_chapters = []
        unverified: list[str] = []
        unconfirmed = 0
        for n, (ch, confirmed) in enumerate(chapters, 1):
            if not confirmed:
                unconfirmed += 1
            notes += strip_leaked_summaries(ch, n)
            verses = []
            for v in ch.verses:
                words, still = join_hyphenated(v.words, v.unverified, fixer)
                v.unverified = still
                text = finish(" ".join(words), tidy)
                if v.number == 1:
                    text = opening_caps(text)
                verses.append({"number": v.number, "text": text})
                unverified += [f"{n}:{v.number} {w}" for w in v.unverified]
            out_chapters.append({"number": n, "verses": verses})
        strip_book_tail(out_chapters, notes)
        long_verses = [
            f"{c['number']}:{v['number']}" for c in out_chapters for v in c["verses"] if len(v["text"].split()) > LONG_VERSE_WORDS
        ]
        empty = [f"{c['number']}:{v['number']}" for c in out_chapters for v in c["verses"] if not v["text"].strip()]
        out_chapters = [
            {"number": c["number"], "verses": [v for v in c["verses"] if v["text"].strip()]} for c in out_chapters
        ]
        gaps = [
            f"{c['number']}:{v['number']}"
            for c in out_chapters
            for i, v in enumerate(c["verses"], 1)
            if v["number"] != i
        ][:1]
        odd = [
            f"{c['number']}:{v['number']}"
            for c in out_chapters
            for v in c["verses"]
            if re.search(r"[^A-Za-z ,.;:?!'\"()—\-\[\]]", v["text"])
        ]
        if gaps:
            notes.append(f"verse numbering skips at {gaps[0]} (a verse number was lost)")
        if odd:
            notes.append(f"unexpected characters in {', '.join(odd[:10])}")
        draft = bool(unconfirmed or unverified or long_verses or empty or notes)
        volume = "jst-" + vid
        book = book_file(volume, kjv_book["id"], kjv_book["title"], "Chapter", out_chapters)
        if draft:
            book["draft"] = True
        if out_chapters:
            volumes[volume].append(book)
        report_rows.append((volume, kjv_book["title"], len(out_chapters), sum(len(c["verses"]) for c in out_chapters),
                            draft, unconfirmed, unverified, long_verses, empty, notes))
    write_report(report_rows)
    return volumes


SUMMARY_LIKE = re.compile(r"—\s?[A-Z][a-z]|^(A|The) (Psalm|prayer|Song)\b|\bPsalm of\b|chief Musician")


def strip_leaked_summaries(ch: J.BuiltChapter, n: int) -> list[str]:
    """1867 chapter summaries that leaked into the text sit in words the KJV
    does not have, at the very start of a chapter or the very end of the
    previous one. Remove the ones that look like summaries (dash-separated
    topics, psalm titles); flag other unexplained text there for proofreading."""
    notes = []
    if ch.verses and ch.verses[0].ocr_prefix >= 3:
        v = ch.verses[0]
        head = v.words[: v.ocr_prefix]
        ends = [k for k, w in enumerate(head) if w.endswith(".")]
        if ends:
            cut = ends[-1] + 1
            chunk = " ".join(head[:cut])
            if SUMMARY_LIKE.search(chunk):
                v.words = v.words[cut:]
                v.unverified = [w for w in v.unverified if w in v.words]
            else:
                notes.append(f"check {n}:1 starts with text not in the KJV: {chunk[:80]!r}")
    if ch.verses and ch.verses[-1].ocr_suffix >= 3:
        v = ch.verses[-1]
        tail = v.words[len(v.words) - v.ocr_suffix :]
        before = v.words[: len(v.words) - v.ocr_suffix]
        if before and before[-1].endswith((".", "!", "?")) and tail[-1].endswith("."):
            chunk = " ".join(tail)
            if SUMMARY_LIKE.search(chunk):
                v.words = before
                v.unverified = [w for w in v.unverified if w in v.words]
            else:
                notes.append(f"check {n}:{v.number} ends with text not in the KJV: {chunk[:80]!r}")
    return notes


def strip_book_tail(chapters: list[dict], notes: list[str]) -> None:
    """Drop what the 1867 edition prints after a book's last verse: the KJV
    epistle subscriptions ("Written to the Romans from Corinthus...") and, at
    the end of a scan, library stamps. Neither is verse text."""
    if not chapters or not chapters[-1]["verses"]:
        return
    last = chapters[-1]["verses"][-1]
    m = re.search(r"^(.*\bAmen\.)\s+(.{0,400})$", last["text"])
    if m and re.search(r"\bwritten\b|\bEnglish\b|\bBible\b", m.group(2), re.I):
        last["text"] = m.group(1)
        notes_dropped = m.group(2)
        _ = notes_dropped  # recorded in TEXTS.md as a rule, not per book
    # A trailing "chapter" made only of a subscription.
    while chapters and len(chapters[-1]["verses"]) <= 2 and re.search(
        r"\bwritten\b", " ".join(v["text"] for v in chapters[-1]["verses"]), re.I
    ) and len(chapters) > 1:
        chapters.pop()
        notes.append("dropped a trailing subscription read as an extra chapter")


def join_hyphenated(words: list[str], unverified: list[str], fixer: J.Fixer) -> tuple[list[str], list[str]]:
    """Re-join words broken across a line ("testi-" "mony")."""
    out: list[str] = []
    still = list(unverified)
    for w in words:
        if out and out[-1].endswith("-") and not out[-1].endswith("--"):
            joined = out[-1][:-1] + w
            if J.norm(joined) in fixer.vocab:
                for part in (out[-1], w):
                    if part in still:
                        still.remove(part)
                out[-1] = joined
                continue
        out.append(w)
    return out, still


def finish(text: str, tidy) -> str:
    text = re.sub(r"\s+([,.;:?!)])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s*—\s*", "—", text)
    text = re.sub(r"([,;:])(?=[A-Za-z])", r"\1 ", text)
    text = tidy(text)
    return text[:1].upper() + text[1:] if text else text


# --------------------------------------------------------------------------
# Merging the two scans
# --------------------------------------------------------------------------


def signature(ch: J.BuiltChapter) -> tuple[int | None, int, str]:
    first = " ".join(ch.verses[0].words[:6]).lower() if ch.verses and ch.verses[0].words else ""
    return ch.ref_chapter, len(ch.verses), first


def same_chapter(x: J.BuiltChapter, y: J.BuiltChapter) -> bool:
    if len(x.verses) != len(y.verses):
        return False
    wx = " ".join(" ".join(v.words) for v in x.verses[:3]).lower().split()[:30]
    wy = " ".join(" ".join(v.words) for v in y.verses[:3]).lower().split()[:30]
    return difflib.SequenceMatcher(None, wx, wy).ratio() > 0.8


def bad_score(ch: J.BuiltChapter) -> int:
    long = sum(1 for v in ch.verses if len(v.words) > LONG_VERSE_WORDS)
    return ch.unverified + 50 * long + 50 * sum(1 for v in ch.verses if not v.words)


def kjv_consistent(ch: J.BuiltChapter, kjv_counts: dict[int, int]) -> bool:
    """The chapter's verses start exactly where the KJV chapter's verses start
    (allowing one verse whose first word the OCR garbled)."""
    starts = [v.ref_start for v in ch.verses]
    known = [s for s in starts if s is not None]
    if not known or any(s[0] != "kjv" for s in known):
        return False
    chapter = known[0][1]
    if any(s[1] != chapter for s in known) or kjv_counts.get(chapter) != len(ch.verses):
        return False
    misses = sum(1 for v in ch.verses if v.ref_start is None)
    return misses <= 1 and all(s[2] == v.number for v, s in zip(ch.verses, starts) if s is not None)


def merge(a: list[J.BuiltChapter] | None, b: list[J.BuiltChapter] | None, fixer: J.Fixer, kjv_counts: dict[int, int]):
    """Returns ([(chapter, confirmed)], notes)."""
    keyed = merge_by_kjv_chapter(a or [], b or [], fixer, kjv_counts)
    if keyed is not None:
        return keyed
    return merge_by_order(a, b, fixer, kjv_counts)


def merge_by_kjv_chapter(a: list[J.BuiltChapter], b: list[J.BuiltChapter], fixer: J.Fixer, kjv_counts: dict[int, int]):
    """For books whose 1867 chapter divisions follow the KJV: build chapter c
    from whichever scan's chapter c is confirmed. Returns None if the book's
    chapters do not line up with the KJV's."""
    candidates: dict[int, list[J.BuiltChapter]] = {}
    for ch in a + b:
        if ch.ref_chapter is not None and ch.ref_chapter > 0:
            candidates.setdefault(ch.ref_chapter, []).append(ch)
    consistent = {c for c, chs in candidates.items() if any(kjv_consistent(x, kjv_counts) for x in chs)}
    if len(consistent) < 0.8 * len(kjv_counts):
        return None
    merged, notes = [], []
    for c in sorted(kjv_counts):
        chs = candidates.get(c, [])
        good = [x for x in chs if kjv_consistent(x, kjv_counts)]
        if not chs:
            notes.append(f"chapter {c} not found in either scan")
            continue
        if good:
            best = min(good, key=bad_score)
            others = [x for x in chs if x is not best and len(x.verses) == len(best.verses)]
            merged.append((combine_verses(best, others[0], fixer) if others else best, True))
            continue
        # Neither scan matches the KJV verse breaks (the JST changed this
        # chapter): confirmed only if the two scans agree with each other.
        pair = [(x, y) for i, x in enumerate(chs) for y in chs[i + 1 :] if same_chapter(x, y)]
        if pair:
            merged.append((combine_verses(*pair[0], fixer), True))
        else:
            merged.append((min(chs, key=bad_score), False))
    return merged, notes


def merge_by_order(a: list[J.BuiltChapter] | None, b: list[J.BuiltChapter] | None, fixer: J.Fixer, kjv_counts: dict[int, int]):
    notes: list[str] = []
    if not a and not b:
        return [], ["book not found in either scan"]
    if not a or not b:
        only = a or b
        notes.append("found in one scan only")
        return [(c, kjv_consistent(c, kjv_counts)) for c in only], notes
    # Pair chapters in order (difflib over chapter signatures).
    sm = difflib.SequenceMatcher(None, [signature(c)[:2] for c in a], [signature(c)[:2] for c in b], autojunk=False)
    pairs: list[tuple[J.BuiltChapter | None, J.BuiltChapter | None]] = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            pairs += list(zip(a[i1:i2], b[j1:j2]))
        else:
            # Unmatched stretch: keep the side that has fewer problems overall.
            sa, sb = a[i1:i2], b[j1:j2]
            pick = sa if (sum(map(bad_score, sa)) + 0 if sa else 10**9) <= (sum(map(bad_score, sb)) if sb else 10**9) else sb
            if sa and sb and len(sa) == len(sb):
                pairs += list(zip(sa, sb))
            else:
                pairs += [((c, None) if pick is sa else (None, c)) for c in pick]
                if sa or sb:
                    notes.append(f"scans disagree on chapter division near chapter {len(pairs)}")
    merged = []
    for x, y in pairs:
        if x is None or y is None:
            c = x or y
            merged.append((c, kjv_consistent(c, kjv_counts)))
            continue
        if same_chapter(x, y):
            merged.append((combine_verses(x, y, fixer), True))
            continue
        # The scans disagree. A scan whose verse breaks match the KJV exactly
        # is right (Inspired Version numbering only departs from the KJV where
        # the text changed).
        cx, cy = kjv_consistent(x, kjv_counts), kjv_consistent(y, kjv_counts)
        if cx or cy:
            merged.append((x if cx else y, True))
        else:
            merged.append((x if bad_score(x) <= bad_score(y) else y, False))
    return merged, notes


def combine_verses(x: J.BuiltChapter, y: J.BuiltChapter, fixer: J.Fixer) -> J.BuiltChapter:
    """Same chapter, same verse count: per verse, take the cleaner reading and
    use the other scan to confirm words the vocabulary could not."""
    verses = []
    for vx, vy in zip(x.verses, y.verses):
        best, other = (vx, vy) if len(vx.unverified) <= len(vy.unverified) else (vy, vx)
        words = list(best.words)
        unverified = list(best.unverified)
        if unverified:
            sm = difflib.SequenceMatcher(None, [w.lower() for w in words], [w.lower() for w in other.words], autojunk=False)
            for tag, i1, i2, j1, j2 in sm.get_opcodes():
                if tag == "equal":
                    for w in words[i1:i2]:
                        if w in unverified:
                            unverified.remove(w)  # both scans read it the same way
                elif tag == "replace" and i2 - i1 == j2 - j1:
                    for k in range(i2 - i1):
                        w, o = words[i1 + k], other.words[j1 + k]
                        if w in unverified and o not in other.unverified:
                            words[i1 + k] = o
                            unverified.remove(w)
        verses.append(J.Verse(best.number, words, unverified, best.ref_start, best.ocr_prefix, best.ocr_suffix))
    return J.BuiltChapter(verses, x.ref_chapter)


# --------------------------------------------------------------------------


def write_report(rows) -> None:
    lines = [
        "# Joseph Smith Translation: build status",
        "",
        "_Generated by `npm run texts:build` (scripts/jst_build.py). Do not edit by hand._",
        "",
        "The Inspired Version is rebuilt from OCR of two scans of the 1867 edition",
        "(see [TEXTS.md](TEXTS.md#joseph-smith-translation)). A book is **ready** when",
        "both scans agree on every chapter's verse count, no word is left unverified",
        "and no verse looks like two verses merged. Other books are marked",
        '`"draft": true` in `public/texts/index.json` and list what to proofread',
        "against the scans.",
        "",
        "| Volume | Book | Chapters | Verses | Status | Chapters to check | Unverified words |",
        "| --- | --- | ---: | ---: | --- | ---: | ---: |",
    ]
    ready = 0
    for volume, title, n_ch, n_v, draft, unconfirmed, unverified, long_verses, empty, notes in rows:
        ready += not draft
        status = "draft" if draft else "ready"
        vol = "OT" if volume == "jst-old-testament" else "NT"
        lines.append(f"| {vol} | {title} | {n_ch} | {n_v} | {status} | {unconfirmed} | {len(unverified)} |")
    lines += ["", f"**{ready} of {len(rows)} books ready.**", "", "## Details for draft books", ""]
    for volume, title, n_ch, n_v, draft, unconfirmed, unverified, long_verses, empty, notes in rows:
        if not draft:
            continue
        lines.append(f"### {title}")
        lines.append("")
        for n in notes:
            lines.append(f"- {n}")
        if unconfirmed:
            lines.append(f"- {unconfirmed} chapter(s) where the two scans do not agree on the verse division")
        if long_verses:
            lines.append(f"- probably merged verses: {', '.join(long_verses[:20])}{' …' if len(long_verses) > 20 else ''}")
        if empty:
            lines.append(f"- empty verses (dropped): {', '.join(empty[:20])}")
        if unverified:
            shown = ", ".join(f"`{u}`" for u in unverified[:30])
            more = f" … and {len(unverified) - 30} more" if len(unverified) > 30 else ""
            lines.append(f"- unverified words: {shown}{more}")
        lines.append("")
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"JST: {ready} of {len(rows)} books ready; report in {REPORT.name}")
