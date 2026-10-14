"""Download the raw scripture sources into raw/ (git-ignored).

Each source goes into its own folder under raw/. Files are only fetched if
they are missing, so re-running is cheap. Pass --force to re-download.

Sources and licenses are documented in docs/TEXTS.md.
"""

import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"

LDS_SCRIPTURES_COMMIT = "eee69342b7290361c65311c89ba281759db6c09c"  # 2018-11-19

SOURCES = {
    # Mormon Documentation Project "lds-scriptures" (The Unlicense): KJV Old and
    # New Testaments, Book of Mormon, Doctrine and Covenants, Pearl of Great Price.
    "lds-scriptures": {
        "lds-scriptures-sqlite3.db": "https://raw.githubusercontent.com/mormon-documentation-project/"
        f"lds-scriptures/{LDS_SCRIPTURES_COMMIT}/lds-scriptures-sqlite3.db",
        "LICENSE": "https://raw.githubusercontent.com/mormon-documentation-project/"
        f"lds-scriptures/{LDS_SCRIPTURES_COMMIT}/LICENSE",
        "ABOUT.txt": "https://raw.githubusercontent.com/mormon-documentation-project/"
        f"lds-scriptures/{LDS_SCRIPTURES_COMMIT}/ABOUT.txt",
    },
    # Official Declaration 1 (the 1890 Manifesto), Wikisource, pinned revision.
    # The text is public domain (1890); checked against the 1890 printing
    # "President Woodruff's Manifesto" (also on Wikisource, scanned).
    "wikisource-od1": {
        "official-declaration-1.wikitext": "https://en.wikisource.org/w/index.php?"
        "title=The_Doctrine_and_Covenants_(unsourced)/Official_Declaration_1"
        "&oldid=15344235&action=raw",
    },
    # Project Gutenberg eBook #56684, The Lectures on Faith (public domain in the USA).
    "gutenberg-56684": {
        "pg56684.txt": "https://www.gutenberg.org/cache/epub/56684/pg56684.txt",
    },
    # 1867 first edition of the Inspired Version (Joseph Smith Translation),
    # Internet Archive scan "holyscripturestr00smituoft" (University of Toronto
    # copy), OCR text. Public domain (published 1867).
    "ia-holyscripturestr00smituoft": {
        "holyscripturestr00smituoft_djvu.txt": "https://archive.org/download/"
        "holyscripturestr00smituoft/holyscripturestr00smituoft_djvu.txt",
    },
    # Second Internet Archive scan of the 1867 edition (BYU copy), used to
    # cross-check OCR errors in the first.
    "ia-holyscriptures00smit": {
        "holyscriptures00smit_djvu.txt": "https://archive.org/download/"
        "holyscriptures00smit/holyscriptures00smit_djvu.txt",
    },
}


def main() -> int:
    force = "--force" in sys.argv
    failed = []
    for folder, files in SOURCES.items():
        dest_dir = RAW / folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        for name, url in files.items():
            dest = dest_dir / name
            if dest.exists() and not force:
                print(f"have   {dest.relative_to(ROOT)}")
                continue
            print(f"fetch  {url}")
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "scripture-typing/0.1"})
                with urllib.request.urlopen(req, timeout=120) as resp:
                    data = resp.read()
                dest.write_bytes(data)
                print(f"saved  {dest.relative_to(ROOT)} ({len(data):,} bytes)")
            except Exception as exc:  # noqa: BLE001 - report and keep going
                print(f"FAILED {url}: {exc}", file=sys.stderr)
                failed.append(url)
    if failed:
        print(f"\n{len(failed)} download(s) failed:", file=sys.stderr)
        for url in failed:
            print(f"  {url}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
