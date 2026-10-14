# Scripture texts

The app ships the scripture text as static JSON in `public/texts/`. This file
records where every text comes from, its edition and licence, and the
decisions made when converting it.

**Only the scripture text itself is included.** Modern chapter headings and
summaries, section introductions, footnotes, cross-references, the Topical
Guide / Bible Dictionary and other study helps are copyrighted and are not
included. Nothing is taken from churchofjesuschrist.org.

## Sources

| Text                                        | Source                                                                                                                                                                                                                                                                                  | Edition                                                                                                                                                                  | Licence                                                                                                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old Testament, New Testament (KJV)          | Mormon Documentation Project, [`lds-scriptures`](https://github.com/mormon-documentation-project/lds-scriptures) SQLite export, commit [`eee6934`](https://github.com/mormon-documentation-project/lds-scriptures/tree/eee69342b7290361c65311c89ba281759db6c09c) (2018-11-19)           | King James Version as printed in the Latter-day Saint edition of the Bible (spelling and punctuation of the 1769 Oxford text)                                            | [The Unlicense](https://github.com/mormon-documentation-project/lds-scriptures/blob/master/LICENSE) (public-domain dedication); the KJV text is public domain in the US     |
| Book of Mormon                              | same dataset                                                                                                                                                                                                                                                                            | 1981 edition text with the 2013 corrections                                                                                                                              | The Unlicense; the text is public domain                                                                                                                                    |
| Doctrine and Covenants, sections 1–138      | same dataset                                                                                                                                                                                                                                                                            | 1981 edition text with the 2013 corrections                                                                                                                              | The Unlicense; the text of sections 1–138 (published 1833–1919) is public domain                                                                                            |
| Pearl of Great Price                        | same dataset                                                                                                                                                                                                                                                                            | 1981 edition text with the 2013 corrections                                                                                                                              | The Unlicense; the text (published 1842–1902) is public domain                                                                                                              |
| Official Declaration 1                      | Wikisource, [The Doctrine and Covenants (unsourced)/Official Declaration 1](<https://en.wikisource.org/w/index.php?title=The_Doctrine_and_Covenants_(unsourced)/Official_Declaration_1&oldid=15344235>), revision 15344235                                                              | Text as printed in the D&C since 1908; compared with the 1890 printing [President Woodruff's Manifesto](https://en.wikisource.org/wiki/President_Woodruff%27s_Manifesto) | Public domain (published 1890)                                                                                                                                              |
| Lectures on Faith                           | [Project Gutenberg eBook #56684](https://www.gutenberg.org/ebooks/56684), produced by the Mormon Texts Project                                                                                                                                                                          | 1835 Doctrine and Covenants text                                                                                                                                         | Public domain in the USA. The Project Gutenberg header, footer and licence are removed, as the Gutenberg licence allows for public-domain texts with the trademark stripped |
| Joseph Smith Translation (Inspired Version) | Internet Archive scans of the 1867 first edition: [`holyscripturestr00smituoft`](https://archive.org/details/holyscripturestr00smituoft) (University of Toronto copy) and [`holyscriptures00smit`](https://archive.org/details/holyscriptures00smit) (BYU copy), OCR text (`_djvu.txt`) | _The Holy Scriptures, Translated and Corrected by the Spirit of Revelation_, Plano, Illinois, 1867                                                                       | Public domain (published 1867). Later editions (1944 "New Corrected Edition" onward) are under copyright and are **not** used                                               |

The Mormon Documentation Project states: "The Scriptures are part of the
public domain, and so are all original works included in this package." The
dataset contains verse text only (no headings, footnotes or study helps).

### Sources considered and not used

- **churchofjesuschrist.org**: not scraped, per project rules.
- **`bcbooks/scriptures-json`**: public domain, but derived from the same
  Mormon Documentation Project data (plus title pages and testimonies), so
  the original dataset was used directly instead.
- **`lds-scriptures.json`** in the same repo: has a broken escape in D&C 135,
  so the SQLite export of the same data is used.
- **Other GitHub JST datasets**: [`sponege/joseph-smith-translation`](https://github.com/sponege/joseph-smith-translation)
  is scraped from churchofjesuschrist.org and has no licence;
  [`awerkamp/markdown-scriptures…`](https://github.com/awerkamp/markdown-scriptures-standard-works-church-of-jesus-christ)
  has no licence; [`mormon-documentation-project/jst`](https://github.com/mormon-documentation-project/jst)
  is empty. None were used.
- **centerplace.org Inspired Version PDF**: hosted by a site associated with
  the current copyright holder of later editions and of unclear licence. Not
  used.

## Decisions

- **Official Declaration 2 is left out.** It dates from 1978 and is under
  copyright.
- **Official Declaration 1** includes the 1890 Manifesto, President Lorenzo
  Snow's motion, the vote and the dateline. The italic introduction and the
  "Excerpts from three addresses by President Wilford Woodruff regarding the
  Manifesto" are left out: the introduction is modern (1981/2013) and
  copyrighted, and the excerpts were selected and edited for the 1981 edition.
  The underlying 1890–1891 addresses are public domain and could be added
  later from the original newspaper printings.
- **Abraham facsimiles and their explanations are left out.** The facsimile
  explanations were first printed in 1842 and are probably public domain, but
  they are explanatory notes attached to images rather than verse text, and
  the current wording could not be confirmed against the 1842 printing.
- **D&C section introductions** (the italic headings) are modern study helps
  and are not included. The D&C file contains only the numbered verses.
- **Book of Mormon book headings** that are part of the original text (for
  example the italic paragraph before 1 Nephi 1) are not in the source
  dataset and are not included. Only numbered verses are typed.
- **Lectures on Faith** contain only the numbered paragraphs of each lecture.
  The question-and-answer review sections after some lectures are not
  numbered paragraphs and are left out. Italic markers (`_word_`) from the
  Gutenberg text are removed. References printed inside the text (such as
  "Acts 15:18") are kept because they are part of the 1835 text.
- **Chapter-opening capitals.** The sources print the first word of each
  chapter in capitals as typography ("IN the beginning"). That word is
  converted to normal case ("In the beginning"). `LORD` (the KJV rendering of
  the divine name) and other capitals inside verses are kept.
- **Dashes.** The sources write an em dash as `--`. It is stored as `—`
  (and typed as `-`, see below).
- **Brackets** that are part of the printed text (D&C 109:2 "[Kirtland]",
  D&C 131:2 "[meaning ...]", Joseph Smith—History 1:2 "[1838]", and the KJV's
  1 John 2:23 "[but]") are kept.

### Typing conversion (done by the app, not the data)

The stored text keeps the original characters. At typing time the app
converts curly quotes to straight quotes, em/en dashes to `-`, `…` to `...`
and non-breaking spaces to normal spaces. Today the only non-keyboard
character in the data is `—`.

## Joseph Smith Translation

There is no clean, openly licensed digital text of the 1867 Inspired Version,
so `scripts/jst_ocr.py` rebuilds it from the OCR of the two 1867 scans:

1. The OCR is tokenised: running heads and page numbers are dropped; chapter
   headers, verse numbers and capitalised chapter openings are kept as
   markers; the 1867 chapter summaries (and psalm titles) between a header and
   the chapter's first verse are dropped.
2. Each book is aligned word-by-word against a reference text: the KJV, plus
   the Book of Moses for Genesis and Joseph Smith—Matthew for Matthew (the
   same revelations).
3. Words that match the reference are taken from the reference (fixing OCR
   errors in the unchanged text). Words only in the OCR are the JST changes;
   they are kept and spell-checked against a vocabulary of all the other
   scripture texts. Reference words missing from the OCR are JST omissions.
4. Chapter and verse breaks come from the 1867 headers, verse numbers and
   chapter openings. Inspired Version chapter and verse divisions differ from
   the KJV in places (for example Genesis and Matthew), so the 1867 printing
   decides; the KJV only fills in verse numbers the OCR lost where the
   numbering runs in step with it.
5. Each chapter is built from both scans and the cleaner one is used.

Punctuation and spelling in the unchanged text therefore follow the KJV
reference rather than the 1867 printing. The Song of Solomon is not in the
Inspired Version and is not included. The revelation to Moses printed before
Genesis in 1867 (Moses 1) is in the Pearl of Great Price and is not repeated.

Books whose rebuilt structure did not pass the checks are marked
`"draft": true` in `index.json` and need proofreading against the scans.
See [JST status](#jst-status) below.

### JST status

[JST-STATUS.md](JST-STATUS.md) is regenerated on every build. It lists each
book as **ready** or **draft** and, for drafts, exactly what to proofread
(chapters where the two scans disagree on verse division, verse numbers the
OCR lost, and words that could not be verified).

A book is ready only when every chapter is confirmed (both scans agree, or the
verse breaks match the KJV exactly), every word is verified (it matches the
KJV, is a known scripture word, or both scans read it the same way), no verse
looks like two merged verses, and the verse numbering has no gaps. Draft books
are still included in the library, flagged `"draft": true` in `index.json`,
so the app can label them.

Other rules applied to the JST text:

- The 1867 chapter summaries, psalm titles and the KJV subscriptions printed
  after the epistles ("Written to the Romans from Corinthus...") are not verse
  text and are removed.
- Isolated OCR specks ("Jl", "%V") are removed. Where specks sit in place of
  KJV words, the KJV words are used (the scan was damaged there, not the
  text changed).
- Words in `scripts/jst_words.txt` were checked by hand against the scans and
  are accepted as real words.

## Data format

`public/texts/index.json` lists volumes and books in canonical order:

```json
{
  "volumes": [
    {
      "id": "book-of-mormon",
      "title": "Book of Mormon",
      "books": [
        {
          "id": "1-nephi",
          "title": "1 Nephi",
          "unitLabel": "Chapter",
          "chapters": 22,
          "path": "texts/book-of-mormon/1-nephi.json"
        }
      ]
    }
  ]
}
```

Each book is `public/texts/<volume>/<book-id>.json`:

```json
{
  "id": "1-nephi",
  "title": "1 Nephi",
  "volume": "book-of-mormon",
  "unitLabel": "Chapter",
  "chapters": [{ "number": 1, "verses": [{ "number": 1, "text": "..." }] }]
}
```

`unitLabel` is `Chapter`, `Section` (D&C), `Declaration` (Official
Declaration 1) or `Lecture` (Lectures on Faith). Lectures on Faith paragraphs
are stored as `verses`.

## Rebuilding

```sh
npm run texts:download   # fetch the sources into raw/ (git-ignored)
npm run texts:build      # write public/texts/
npm run texts:check      # validate the output
```

The raw downloads are not committed; only the generated JSON is.
