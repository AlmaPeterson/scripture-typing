"""Rebuild the 1867 Inspired Version (Joseph Smith Translation) from OCR.

There is no clean, openly licensed digital text of the Inspired Version, so it
is rebuilt from the OCR of two public-domain scans of the 1867 first edition
(Internet Archive). OCR of a two-column Bible is noisy: misread letters,
dropped line-end hyphens, mangled or misplaced verse numbers and chapter
headers, and occasionally missing pages.

Most of the Inspired Version is word-for-word the King James Version, so each
book is aligned word-by-word against a clean reference text (the KJV, plus
the Book of Moses for Genesis and Joseph Smith--Matthew for Matthew, which are
the same revelations). Then:

- Words that match the reference are taken from the reference, which fixes
  OCR spelling errors and restores punctuation in the unchanged text.
- Words the OCR has that the reference does not are the Joseph Smith
  Translation changes. They are kept from the OCR and spell-checked against a
  vocabulary built from all the other scripture texts.
- Reference words with no counterpart in the OCR are treated as JST omissions.
- Verse and chapter breaks come from the OCR's verse numbers and chapter
  starts, with gaps filled in from the reference wherever the numbering runs
  in step with the KJV.

Both scans are processed and, chapter by chapter, the one that reads more
cleanly is used. Words that still could not be verified are reported so they
can be proofread against the scans.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field

# --------------------------------------------------------------------------
# Tokenising the OCR
# --------------------------------------------------------------------------

DIGIT_FIX = str.maketrans({"l": "1", "I": "1", "i": "1", "|": "1", "O": "0", "o": "0",
                           "S": "5", "s": "5", "B": "8", "Z": "2", "z": "2", "G": "6",
                           "b": "6", "g": "9", "q": "9", "t": "1", "J": "1", "j": "1",
                           "T": "7", "A": "4", "!": "1", "]": "1", "%": "5"})
HEADER_RE = re.compile(
    r"^(?:C\s?[HI1l][A-Za-z1 ]{2,6}[RK]?|PSALM|PSAL[A-Z]?|PS\s?A\s?L\s?M)\s*\.?\s*([IVXLCTHl1 ]{1,12})\.?[,:;]?\s*$"
)
SMALL_CAPS_WORDS = {"LORD", "GOD", "JEHOVAH", "JAH", "I", "O", "A", "LORD'S", "AM"}

PUNCT_ONLY = re.compile(r"^[^\w]+$")


DIGIT_AS_LETTER = str.maketrans("0134578", "oleastb")


def norm(word: str) -> str:
    """Lower-case letters only; how words are compared. Digits inside a word
    are OCR misreads of letters ("day8" -> "days")."""
    if re.search(r"[A-Za-z]", word) or word == "0":
        word = word.translate(DIGIT_AS_LETTER)
    return re.sub(r"[^a-z]", "", word.lower())


ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def roman_value(s: str) -> int | None:
    """Value of an OCR'd roman numeral ("XIV", "XlV", "TI" for "II")."""
    s = s.replace(" ", "").upper().replace("T", "I").replace("1", "I").replace("H", "II")
    if not s or any(c not in ROMAN for c in s):
        return None
    total = 0
    for i, c in enumerate(s):
        v = ROMAN[c]
        total += -v if i + 1 < len(s) and ROMAN[s[i + 1]] > v else v
    return total


def is_running_head(line: str) -> bool:
    letters = [c for c in line if c.isalpha()]
    return not letters or not any(c.islower() for c in letters)


def number_value(token: str) -> int | None:
    """Value of a (possibly OCR-mangled) verse number, or None."""
    t = token.strip(".,;:'’*-_^•")
    if not t or len(t) > 3 or not any(c.isdigit() for c in t):
        return None
    fixed = t.translate(DIGIT_FIX)
    return int(fixed) if fixed.isdigit() and fixed[0] != "0" else None


@dataclass
class Tok:
    kind: str  # "w" word, "n" verse number, "h" chapter header, "c" capitalised chapter opening
    text: str = ""
    value: int | None = None
    line_end: bool = False  # last word on its OCR line (for lost hyphens)
    summary: bool = False  # chapter summary text (dropped)


def tokenize(text: str, start_line: int, end_line: int | None = None) -> list[Tok]:
    lines = text.splitlines()[start_line:end_line]
    toks: list[Tok] = []
    header_since_opening = False
    for raw in lines:
        line = re.sub(r"\s+", " ", raw).strip()
        if not line:
            continue
        m = HEADER_RE.match(line)
        if m:
            toks.append(Tok("h", line, value=roman_value(m.group(1))))
            header_since_opening = True
            continue
        if is_running_head(line):
            continue
        words = line.split(" ")
        # Glue stray punctuation (" ;") back onto the previous word.
        merged: list[str] = []
        for w in words:
            if merged and PUNCT_ONLY.match(w) and not number_value(w):
                merged[-1] += w
            else:
                merged.append(w)
        words = merged
        first = words[0]
        first_letters = re.sub(r"[^A-Za-z']", "", first)
        is_opening = (
            len(first_letters) >= 2
            and first_letters.isupper()
            and first_letters not in SMALL_CAPS_WORDS
            and len(words) > 1
            and any(c.islower() for c in " ".join(words[1:]))
            and not re.fullmatch(r"[IlOSBZG]{2,3}", first_letters)
        )
        if is_opening:
            # The chapter's first verse, printed with a capitalised first word.
            # The words between it and the last header / verse number before
            # it are the 1867 chapter summary (or a psalm title).
            if header_since_opening:
                run = []
                for k in range(len(toks) - 1, -1, -1):
                    if toks[k].kind in ("n", "h", "c"):
                        break
                    run.append(k)
                if len(run) <= 45:
                    for k in run:
                        toks[k].summary = True
            header_since_opening = False
            toks.append(Tok("c"))
            words[0] = first[0] + first[1:].lower()
        if (
            len(words) > 1
            and re.fullmatch(r"[0-9IlOSBZG|]{2,3}[.,]?", words[0])
            and words[1][:1].isupper()
        ):
            fixed = words[0].rstrip(".,").translate(DIGIT_FIX)
            if fixed.isdigit():
                toks.append(Tok("n", words[0], value=int(fixed)))
                words = words[1:]
        for i, w in enumerate(words):
            v = number_value(w)
            # The KJV spells out numbers, so a numeral is a verse number (or
            # OCR noise), never part of the text.
            if v is not None and (i == 0 or i + 1 < len(words)):
                toks.append(Tok("n", w, value=v))
                continue
            if v is not None:
                continue  # trailing stray digits
            if w in ("-", "—", "_", "•", "^", "*", "|"):
                continue
            toks.append(Tok("w", w))
        for t in reversed(toks):
            if t.kind == "w":
                t.line_end = True
                break
    # Join words split by a printed line-end hyphen ("com-" / "passeth").
    out: list[Tok] = []
    for t in toks:
        # The previous word, looking past chapter-header running heads.
        k = len(out) - 1
        while k >= 0 and out[k].kind == "h" and len(out) - k <= 3:
            k -= 1
        prev = out[k] if k >= 0 and out[k].kind == "w" else None
        if (
            t.kind == "w"
            and prev is not None
            and prev.line_end
            and prev.text.endswith("-")
            and not prev.text.endswith("--")
        ):
            prev.text = prev.text[:-1] + t.text
            prev.line_end = t.line_end
            continue
        out.append(t)
    return out


# --------------------------------------------------------------------------
# Reference text
# --------------------------------------------------------------------------


@dataclass
class RefWord:
    text: str
    norm: str
    chapter: int
    verse: int
    source: str  # "kjv" or another book id (moses, js-m)
    first: bool  # first word of its verse


def ref_words(chapters: list[tuple[str, int, list[tuple[int, str]]]]) -> list[RefWord]:
    """chapters: (source, chapter number, [(verse number, text)])"""
    words: list[RefWord] = []
    for source, ch, verses in chapters:
        for vn, text in verses:
            for i, w in enumerate(text.split()):
                n = norm(w)
                if n:
                    words.append(RefWord(w, n, ch, vn, source, i == 0))
    return words


# --------------------------------------------------------------------------
# Alignment
# --------------------------------------------------------------------------


def align(a: list[str], b: list[str]) -> list[tuple[str, int, int, int, int]]:
    """difflib opcodes, refined: coarse pass with autojunk, then re-align
    the non-equal gaps exactly so common words are matched too."""
    sm = difflib.SequenceMatcher(None, a, b, autojunk=True)
    out = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal" or (i2 - i1) * (j2 - j1) == 0 or (i2 - i1) * (j2 - j1) > 4_000_000:
            out.append((tag, i1, i2, j1, j2))
            continue
        sub = difflib.SequenceMatcher(None, a[i1:i2], b[j1:j2], autojunk=False)
        for t, x1, x2, y1, y2 in sub.get_opcodes():
            out.append((t, i1 + x1, i1 + x2, j1 + y1, j1 + y2))
    return out


# --------------------------------------------------------------------------
# Rebuilding one book
# --------------------------------------------------------------------------

OCR_CONFUSIONS = [("rn", "m"), ("m", "rn"), ("li", "h"), ("h", "li"), ("tl", "th"), ("ii", "u"),
                  ("c", "e"), ("e", "c"), ("n", "u"), ("u", "n"), ("j", "i"), ("f", "t"),
                  ("t", "f"), ("1", "l"), ("l", "i"), ("i", "l"), ("o", "a"), ("a", "o"),
                  ("v", "y"), ("y", "v"), ("b", "h"), ("h", "b"), ("s", "a"), ("vv", "w"),
                  ("ni", "m"), ("in", "m"), ("ui", "m"), ("iu", "m"), ("nn", "m"), ("nn", "im"),
                  ("il", "h"), ("ii", "n"), ("cx", "ey"), ("tb", "th"), ("rd", "nd"), ("q", "g"),
                  ("n", "o"), ("i", "t"), ("r", "t"), ("cl", "d"), ("ri", "n"), ("fi", "h")]


def is_junk(word: str) -> bool:
    """OCR specks: short letter clusters that are not words ("Jl", "hj", "%V")."""
    letters = re.sub(r"[^A-Za-z]", "", word)
    if not letters:
        return True
    return len(letters) <= 3 and not re.search(r"[aeiouyAEIOUY]", letters) or (len(letters) <= 2 and not letters.islower() and letters not in ("I", "O", "A") and not letters.istitle())


def edit1(word: str) -> set[str]:
    letters = "abcdefghijklmnopqrstuvwxyz"
    splits = [(word[:i], word[i:]) for i in range(len(word) + 1)]
    deletes = {l + r[1:] for l, r in splits if r}
    replaces = {l + c + r[1:] for l, r in splits if r for c in letters}
    inserts = {l + c + r for l, r in splits for c in letters}
    return deletes | replaces | inserts


@dataclass
class Fixer:
    vocab: dict[str, int]  # normalised word -> frequency in all scripture
    display: dict[str, str]  # normalised word -> most common written form

    def correct(self, word: str) -> tuple[str, bool]:
        """Return (corrected word, verified)."""
        n = norm(word)
        if not n:
            return word, False
        if n in self.vocab and not re.search(r"[^A-Za-z'’,.;:?!()\"—-]", word):
            return word, True
        if n in self.vocab:
            return restyle(word, n, self.display[n]), True  # e.g. "day8" -> "days"
        # Two words run together ("notafter", "the.land", "of'thy").
        core = word.strip(".,;:?!()'\"")
        parts = re.split(r"[.,;:'’](?=[A-Za-z])", core)
        if len(parts) == 2 and all(norm(p) in self.vocab for p in parts):
            return word.replace(core, " ".join(parts)), True
        for k in range(2, len(n) - 1):
            a, b = n[:k], n[k:]
            if a in self.vocab and b in self.vocab and len(a) >= 2 and len(b) >= 3 and self.vocab[a] > 20 and self.vocab[b] > 20:
                m = re.match(r"^([^A-Za-z]*)([A-Za-z]+)(.*)$", word)
                if m and len(m.group(2)) == len(n):
                    return m.group(1) + m.group(2)[:k] + " " + m.group(2)[k:] + m.group(3), True
        candidates: set[str] = set()
        for a, b in OCR_CONFUSIONS:
            for m in re.finditer(re.escape(a), n):
                c = n[: m.start()] + b + n[m.end():]
                if c in self.vocab:
                    candidates.add(c)
        if not candidates and len(n) >= 4:
            candidates = {c for c in edit1(n) if c in self.vocab}
        if not candidates:
            return word, False
        best = max(candidates, key=lambda c: self.vocab[c])
        return restyle(word, n, self.display[best]), True


def restyle(original: str, n: str, replacement: str) -> str:
    """Put `replacement` in place of the letters of `original`, keeping its
    leading/trailing punctuation and its capitalisation."""
    m = re.match(r"^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$", original)
    lead, core, trail = m.groups() if m else ("", original, "")
    rep = replacement.strip(".,;:?!()'\"")
    if core[:1].isupper():
        rep = rep[:1].upper() + rep[1:]
    return lead + rep + trail


def clean_ocr_word(w: str) -> str:
    w = w.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    w = re.sub(r"[•^_|*\\{}<>~`]", "", w)
    w = re.sub(r"^0$", "O", w)
    w = re.sub(r"(?<=[A-Za-z])0|0(?=[A-Za-z])", "o", w)
    return w


@dataclass
class Verse:
    number: int
    words: list[str] = field(default_factory=list)
    unverified: list[str] = field(default_factory=list)
    # (source, chapter, verse) of the reference verse this verse starts with,
    # if its first word is the first word of a reference verse.
    ref_start: tuple[str, int, int] | None = None
    # Number of leading / trailing words that are not in the reference text
    # (where a leaked chapter summary would sit).
    ocr_prefix: int = 0
    ocr_suffix: int = 0
    kjv_words: int = 0  # words that matched the reference


@dataclass
class BuiltChapter:
    verses: list[Verse]
    ref_chapter: int | None  # reference chapter most of it matches
    problems: list[str] = field(default_factory=list)

    @property
    def unverified(self) -> int:
        return sum(len(v.unverified) for v in self.verses)


@dataclass
class Item:
    """One output word, with where it came from."""

    text: str
    ref: int | None  # reference word index, if taken from the reference
    verified: bool
    tok: int  # token index it came from


def join_split_words(toks: list[Tok], fixer: Fixer) -> None:
    """Re-join words split at a line end whose hyphen the OCR dropped
    ("multi" / "ply"), when the joined word is a real word and a piece is not."""
    words = [i for i, t in enumerate(toks) if t.kind == "w"]
    for x, y in zip(words, words[1:]):
        t, u = toks[x], toks[y]
        if not t.line_end or t.kind != "w" or u.kind != "w" or y != x + 1:
            continue
        a, b = norm(t.text), norm(u.text)
        if not a or not b:
            continue
        if a + b in fixer.vocab and (a not in fixer.vocab or b not in fixer.vocab):
            u.text = re.sub(r"[^A-Za-z']+$", "", t.text) + u.text
            u.text = u.text.replace("-", "") if "-" not in a + b else u.text
            t.kind = "x"  # merged away


def map_words(toks: list[Tok], ref: list[RefWord], fixer: Fixer) -> dict[int, object]:
    """For each OCR word token index: a reference index (int), a ("span", j1, j2)
    reference range that replaces it, or None (keep the OCR word)."""
    idx = [i for i, t in enumerate(toks) if t.kind == "w" and not t.summary and norm(t.text)]
    a = [norm(toks[i].text) for i in idx]
    b = [r.norm for r in ref]
    mapping: dict[int, object] = {i: None for i in idx}
    for tag, i1, i2, j1, j2 in align(a, b):
        if tag == "equal":
            for k in range(i2 - i1):
                mapping[idx[i1 + k]] = j1 + k
        elif tag == "replace":
            if "".join(a[i1:i2]) == "".join(b[j1:j2]):
                # Same letters, different word breaks (a lost line-end hyphen).
                mapping[idx[i1]] = ("span", j1, j2)
                for i in range(i1 + 1, i2):
                    mapping[idx[i]] = ("span", j2, j2)
            elif all(is_junk(toks[idx[i]].text) for i in range(i1, i2)) and j2 - j1 <= 8:
                # Only OCR specks where the reference has words: the scan lost
                # them (a damaged or decorated letter), not the translation.
                mapping[idx[i1]] = ("span", j1, j2)
                for i in range(i1 + 1, i2):
                    mapping[idx[i]] = ("span", j2, j2)
            elif i2 - i1 == j2 - j1:
                for k in range(i2 - i1):
                    on, rn = a[i1 + k], b[j1 + k]
                    ratio = difflib.SequenceMatcher(None, on, rn).ratio()
                    garbled = on not in fixer.vocab or re.search(r"[^A-Za-z'’,.;:?!()\"—-]", toks[idx[i1 + k]].text)
                    one_off = len(on) == len(rn) and sum(x != y for x, y in zip(on, rn)) <= 1
                    if garbled and (ratio >= 0.5 or one_off):
                        mapping[idx[i1 + k]] = j1 + k  # OCR garble of the reference word
    return mapping


OPENERS = ["then", "the", "thus", "wherefore", "now", "and", "therefore", "these", "this", "there",
           "when", "who", "what", "hear", "behold", "moreover", "after", "again", "at", "in", "for", "but"]


def fix_opening(word: str, fixer: Fixer) -> str:
    """The first word of a chapter is printed with a large decorated capital
    that the OCR often mangles ("rflHEN", "nnHE", "I1HE"). Recover the word
    from the letters after the capital."""
    n = norm(word)
    if n in fixer.vocab and not re.search(r"\d", word):
        return word
    for w in OPENERS:
        for cut in (1, 2):
            tail = w[cut:]
            if len(tail) >= 2 and n.endswith(tail) and len(n) <= len(w) + 3:
                return w.capitalize() + re.sub(r"^.*?([^A-Za-z]*)$", r"\1", word)
    return word


def ref_form(r: RefWord, ocr: str) -> str:
    """The reference word as it should appear in the Inspired Version text."""
    text = r.text
    letters = re.sub(r"[^A-Za-z]", "", text)
    if r.first and r.verse == 1 and len(letters) > 1 and letters.isupper() and letters not in SMALL_CAPS_WORDS:
        text = text.replace(letters, letters.capitalize(), 1)  # chapter-opening capitals
    # A KJV verse can start mid-verse in the Inspired Version and vice versa:
    # take the capitalisation of the first letter from the 1867 printing.
    o = re.sub(r"^[^A-Za-z]+", "", ocr)
    if o and norm(o) == r.norm and text[:1].isalpha() and not letters.isupper():
        text = (o[0].upper() if o[0].isupper() else o[0].lower()) + text[1:]
    return text


def build_book(toks: list[Tok], ref: list[RefWord], fixer: Fixer) -> list[BuiltChapter]:
    join_split_words(toks, fixer)
    mapping = map_words(toks, ref, fixer)

    # Pass 1: the word stream, plus where the structural markers fall in it.
    items: list[Item] = []
    nums: list[tuple[int, int | None]] = []  # (item position, value)
    opens: list[int] = []  # capitalised chapter openings
    headers: list[tuple[int, int | None]] = []  # (item position, chapter number)
    for i, t in enumerate(toks):
        if t.kind == "n":
            nums.append((len(items), t.value))
        elif t.kind == "c":
            opens.append(len(items))
        elif t.kind == "h":
            headers.append((len(items), t.value))
        elif t.kind == "w" and not t.summary and i in mapping:
            m = mapping[i]
            if isinstance(m, int):
                items.append(Item(ref_form(ref[m], t.text), m, True, i))
            elif isinstance(m, tuple):
                items.extend(Item(ref_form(ref[j], ""), j, True, i) for j in range(m[1], m[2]))
            else:
                w = clean_ocr_word(t.text)
                opening = bool(opens) and opens[-1] == len(items)
                if opening or re.fullmatch(r"[^A-Z\s]{1,4}[A-Z]{2,}[,.;:]?", w):
                    w = fix_opening(w, fixer)
                if norm(w) and not is_junk(w):
                    w, ok = fixer.correct(w)
                    items.append(Item(w, None, ok, i))

    # Where JST text meets unchanged text, the punctuation between them is the
    # 1867 printing's, not the KJV's ("at any time, except them who believe").
    for k in range(len(items) - 1):
        a_it, b_it = items[k], items[k + 1]
        if a_it.ref is not None and b_it.ref is None and toks[a_it.tok].kind == "w":
            ocr = clean_ocr_word(toks[a_it.tok].text)
            if norm(ocr) == norm(a_it.text):
                trail = re.search(r"[,.;:?!]*$", ocr).group(0)
                trail = trail.replace(".", ",") if b_it.text[:1].islower() else trail
                a_it.text = re.sub(r"[,.;:?!]*$", "", a_it.text) + trail

    # Reference verse starts: position of the first item of each reference verse.
    ref_starts: dict[tuple[str, int, int], int] = {}
    for pos, it in enumerate(items):
        if it.ref is not None:
            r = ref[it.ref]
            key = (r.source, r.chapter, r.verse)
            if key not in ref_starts:
                # Only a true start if we are at (or near) the verse's first word.
                first = it.ref
                while first > 0 and (ref[first - 1].source, ref[first - 1].chapter, ref[first - 1].verse) == key:
                    first -= 1
                if it.ref - first <= 3:
                    back = it.ref - first
                    ref_starts[key] = max(0, pos - back)

    # Pass 2: chapter boundaries.
    num_pos = [p for p, _ in nums]

    def next_num(pos: int, limit: int = 250) -> int | None:
        for p, v in nums:
            if pos <= p < pos + limit:
                return v
            if p >= pos + limit:
                break
        return None

    def near(sorted_positions: list[int], pos: int, dist: int) -> bool:  # noqa: D401
        return any(abs(p - pos) <= dist for p in sorted_positions)

    kjv_chapter_starts = sorted(p for (src, ch, v), p in ref_starts.items() if v == 1 and src == "kjv")
    other_starts = sorted(p for (src, ch, v), p in ref_starts.items() if v == 1 and src != "kjv")
    header_pos = [p for p, _ in headers]
    strong = sorted(p for p in opens if next_num(p) in (2, 3))
    weak = sorted(set(opens) | {p for p in kjv_chapter_starts + other_starts if next_num(p, 150) in (2, 3)})
    starts: set[int] = {0}
    # Each printed chapter header belongs to a chapter opening near it. The
    # OCR sometimes places a header up to a column early, so look ahead first.
    for h, _value in headers:
        after = [p for p in strong if h - 5 <= p <= h + 700 and p not in starts]
        before = [p for p in strong if h - 300 <= p < h - 5 and p not in starts]
        pick = after[0] if after else (before[-1] if before else None)
        if pick is None:
            after = [p for p in weak if h - 5 <= p <= h + 700 and p not in starts]
            pick = after[0] if after else None
        if pick is not None:
            starts.add(pick)
    # Openings whose header the OCR lost entirely.
    for p in strong:
        if not near(header_pos, p, 700) and not near(sorted(starts), p, 20):
            starts.add(p)
    # Reference chapter starts where the verse numbers restart, even though
    # the OCR lost both the header and the capitalised opening.
    for p in kjv_chapter_starts + other_starts:
        if next_num(p, 150) in (2, 3) and not near(sorted(starts), p, 20):
            starts.add(p)
    bounds = sorted(starts) + [len(items)]

    # Chapter summaries the tokenizer could not flag (the chapter opening was
    # misread): text between a header and the next chapter start that is not
    # in the reference at all.
    drop: set[int] = set()
    for c0 in bounds[1:-1]:
        hs = [h for h in header_pos if 0 < c0 - h <= 60]
        if hs:
            h = hs[0]
            if all(items[k].ref is None for k in range(h, c0)):
                drop.update(range(h, c0))
    # After the book's last verse: KJV epistle subscriptions ("Written to the
    # Romans from Corinthus...") and, at the end of a scan, library stamps.
    last_ref = max((k for k, it in enumerate(items) if it.ref is not None), default=len(items) - 1)
    tail = items[last_ref + 1 :]
    if tail and len(tail) <= 60 and (
        any(norm(it.text) == "written" for it in tail) or sum(not it.verified for it in tail) * 2 >= len(tail)
    ):
        drop.update(range(last_ref + 1, len(items)))
    if drop:
        keep = [k for k in range(len(items)) if k not in drop]
        remap = {old: new for new, old in enumerate(keep)}

        def moved(p: int) -> int:
            while p < len(items) and p in drop:
                p += 1
            return remap.get(p, len(keep))

        items = [items[k] for k in keep]
        bounds = sorted({moved(p) for p in bounds[:-1]}) + [len(items)]
        nums = [(moved(p), v) for p, v in nums if p not in drop]
        header_pos = [moved(p) for p in header_pos]
        ref_starts = {key: moved(p) for key, p in ref_starts.items() if p not in drop}

    # Pass 3: verses within each chapter.
    chapters: list[BuiltChapter] = []
    ref_start_at: dict[int, list[tuple[str, int, int]]] = {}
    for key, p in ref_starts.items():
        ref_start_at.setdefault(p, []).append(key)
    for c0, c1 in zip(bounds, bounds[1:]):
        if c0 >= c1:
            continue
        cut_points: list[tuple[int, int]] = [(c0, 1)]  # (item position, verse number)
        expected = 2
        offset: int | None = None
        events: list[tuple[int, str, object]] = []
        for p, v in nums:
            if c0 < p < c1:
                events.append((p, "n", v))
        for p in range(c0, c1):
            for key in ref_start_at.get(p, []):
                events.append((p, "r", key))
        events.sort(key=lambda e: (e[0], e[1] != "n"))
        last_cut = c0
        for p, kind, val in events:
            if kind == "n":
                v = val
                if v == expected or (v is not None and _close(v, expected)):
                    if p > last_cut:
                        cut_points.append((p, expected))
                        last_cut = p
                        expected += 1
                elif v == expected + 1 and p > last_cut:
                    # One number was lost; it is resolved by a reference start
                    # between last_cut and p if there is one.
                    mid = [q for q, keys in ref_start_at.items() if last_cut < q < p]
                    if mid:
                        cut_points.append((max(mid), expected))
                    cut_points.append((p, expected + 1))
                    last_cut = p
                    expected += 2
            else:
                src, ch, rv = val
                if src != "kjv" or rv == 1:
                    continue
                if offset is not None and rv + offset == expected and p > last_cut:
                    # The OCR lost this verse number; the numbering runs in step
                    # with the KJV here, so the KJV verse start marks it.
                    cut_points.append((p, expected))
                    last_cut = p
                    expected += 1
                elif p == last_cut and cut_points:
                    offset = cut_points[-1][1] - rv
        verses: list[Verse] = []
        cut_points.sort()
        for (p, n), (q, _) in zip(cut_points, cut_points[1:] + [(c1, 0)]):
            v = Verse(n, [it.text for it in items[p:q]],
                      [it.text for it in items[p:q] if not it.verified])
            if p < q and items[p].ref is not None and ref[items[p].ref].first:
                r = ref[items[p].ref]
                v.ref_start = (r.source, r.chapter, r.verse)
            span = items[p:q]
            v.kjv_words = sum(1 for it in span if it.ref is not None)
            v.ocr_prefix = next((k for k, it in enumerate(span) if it.ref is not None), len(span))
            v.ocr_suffix = next((k for k, it in enumerate(reversed(span)) if it.ref is not None), len(span))
            verses.append(v)
        refs_in = [ref[it.ref].chapter if ref[it.ref].source == "kjv" else -1
                   for it in items[c0:c1] if it.ref is not None]
        rc = max(set(refs_in), key=refs_in.count) if refs_in else None
        ch = BuiltChapter(verses, rc)
        ch.problems += _strip_summaries(ch, items[c0:c1])
        chapters.append(ch)
    return chapters


SUMMARY_DASH = re.compile(r"[—–]|--|\w-$")
# Psalm titles ("To the chief Musician, A Psalm of David") are headings in the
# KJV and are not part of the verse text.
PSALM_TITLE = re.compile(r"^(Psalm|Musician|Musicians|Maschil|Michtam|Shiggaion|Neginoth|Sheminith|Gittith|Alamoth|Muthlabben|Shoshannim|Mahalath|Leannoth|Jeduthun|degrees)\W*$", re.I)


def _strip_summaries(ch: BuiltChapter, items: list[Item]) -> list[str]:
    """Drop 1867 chapter summaries that leaked into the text because their
    header was misplaced: a run of words not in the KJV, containing dashes,
    at the very start or very end of the chapter."""
    problems = []
    for where in ("start", "end"):
        verse = ch.verses[0] if where == "start" else ch.verses[-1]
        words = verse.words
        if not words:
            continue
        # Find the run of OCR-only words at that end of the verse.
        ocr_only = {it.text for it in items if it.ref is None}
        run = 0
        seq = words if where == "start" else list(reversed(words))
        for w in seq:
            if w in ocr_only:
                run += 1
            else:
                break
        if run < 3 or run > 40:
            continue
        chunk = seq[:run]
        if not any(SUMMARY_DASH.search(w) or PSALM_TITLE.match(w) for w in chunk):
            continue
        dropped = " ".join(chunk if where == "start" else reversed(chunk))
        if where == "start":
            verse.words = words[run:]
        else:
            verse.words = words[: len(words) - run]
        verse.unverified = [w for w in verse.unverified if w in verse.words]
        problems.append(f"dropped probable chapter summary at {where}: {dropped!r}")
    return problems


def _close(v: int, exp: int) -> bool:
    s, e = str(v), str(exp)
    return len(s) == len(e) >= 2 and sum(x != y for x, y in zip(s, e)) == 1


# --------------------------------------------------------------------------
# Whole Bible
# --------------------------------------------------------------------------


def scripture_start(text: str) -> int:
    """Line where the Bible text starts (after the title page, preface and the
    revelation to Moses printed before Genesis)."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if i > 200 and "HOLY" in line.upper() and "SCRIPTURES" in line.upper():
            return i
    raise ValueError("could not find the start of the text")


def find_book_starts(toks: list[Tok], refs: list[list[RefWord]], ngram: int = 6) -> list[int | None]:
    """Token index where each book starts.

    Word n-grams that occur exactly once in the whole reference Bible and
    exactly once in the OCR are anchors. Anchors that are out of order
    (OCR noise, repeated passages) are removed with a longest increasing
    subsequence; each book then starts at the chapter opening or header just
    before its first anchor."""
    pos = [i for i, t in enumerate(toks) if t.kind == "w" and not t.summary and norm(t.text)]
    words = [norm(toks[i].text) for i in pos]

    ref_grams: dict[tuple[str, ...], tuple[int, int] | None] = {}
    for b, ref in enumerate(refs):
        rw = [r.norm for r in ref]
        for k in range(len(rw) - ngram + 1):
            g = tuple(rw[k : k + ngram])
            ref_grams[g] = None if g in ref_grams else (b, k)
    ocr_grams: dict[tuple[str, ...], int | None] = {}
    for k in range(len(words) - ngram + 1):
        g = tuple(words[k : k + ngram])
        if g in ref_grams and ref_grams[g] is not None:
            ocr_grams[g] = None if g in ocr_grams else k

    offsets = [0]
    for ref in refs:
        offsets.append(offsets[-1] + len(ref))
    anchors = sorted(
        (k, offsets[ref_grams[g][0]] + ref_grams[g][1], ref_grams[g][0])  # type: ignore[index]
        for g, k in ocr_grams.items()
        if k is not None
    )
    keep = _lis([a[1] for a in anchors])
    anchors = [anchors[i] for i in keep]

    first: dict[int, int] = {}
    last: dict[int, int] = {}
    for k, _, b in anchors:
        first.setdefault(b, k)
        last[b] = k
    starts: list[int | None] = []
    for b in range(len(refs)):
        if b not in first:
            starts.append(None)
            continue
        lo = max((last[x] for x in last if x < b), default=0)
        hi = first[b]
        # The book opens at the last header / chapter opening between the
        # previous book's last anchor and this book's first anchor.
        lo_t, hi_t = pos[lo], pos[hi]
        ti = hi_t
        for back in range(hi_t, lo_t, -1):
            if toks[back].kind == "h":
                ti = back
                break
        else:
            for back in range(hi_t, lo_t, -1):
                if toks[back].kind == "c":
                    ti = back
                    break
        starts.append(ti)
    return starts


def _lis(seq: list[int]) -> list[int]:
    """Indexes of a longest strictly increasing subsequence."""
    import bisect

    tails: list[int] = []
    tails_idx: list[int] = []
    prev = [-1] * len(seq)
    for i, x in enumerate(seq):
        j = bisect.bisect_left(tails, x)
        if j == len(tails):
            tails.append(x)
            tails_idx.append(i)
        else:
            tails[j] = x
            tails_idx[j] = i
        prev[i] = tails_idx[j - 1] if j else -1
    out = []
    i = tails_idx[-1] if tails_idx else -1
    while i != -1:
        out.append(i)
        i = prev[i]
    return out[::-1]
