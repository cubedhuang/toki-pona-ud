"""Extract **openly licensed** texts from a poki Lapo clone into one JSONL file.

Usage: python pipeline/0_poki.py OUT_DIR POKI

- POKI is a clone of https://github.com/kulupu-lapo/poki.
- Only texts whose `license` is CC0, public domain, MIT, CC BY or CC BY-SA are kept.
  - NC, ND, all-rights-reserved and missing licenses are dropped.
- Markdown and HTML are reduced to plain text, and each paragraph becomes one line.
- Speaker labels at the start of a line (**jan Tepo:**, SITELEN NANPA WAN:) are removed.
- In texts hard-wrapped at a fixed width (HARD_WRAPPED), line breaks within a paragraph are
  spaces. Elsewhere they are kept, and 1_segment.py decides whether they end a sentence.
- Output is OUT_DIR/poki.jsonl, one object per paragraph, in the shape 1_segment.py reads:

    id, title, authors, original, date, license, sources, content

- id is "<path under plaintext>#<paragraph number>".
- license is normalized to an SPDX-style id; for "A OR B" an open choice is kept, preferring CC.
- original holds the original title and authors when the text is a translation.
"""

import html
import json
import re
import sys
from collections import Counter
from pathlib import Path

import yaml

OPEN_LICENSE = re.compile(
    r"^(?:CC-BY(?:-SA)?(?:-\d\.\d)?|CC0-1\.0|MIT|LicenseRef-PublicDomain)$"
)


def normalize_license(raw: str | None) -> str | None:
    """An SPDX-style id for an open license, or None if the license isn't open."""
    if not raw:
        return None
    choices = []
    for option in re.split(r"\s+OR\s+", raw.strip()):
        if re.search(r"\s+AND\s+", option):
            continue  # every part would have to be open; none in poki are
        spdx = re.sub(r"[\s_]+", "-", option.strip().upper())
        spdx = {"CC0": "CC0-1.0", "PUBLIC-DOMAIN": "LicenseRef-PublicDomain"}.get(
            spdx, spdx
        )
        if OPEN_LICENSE.match(spdx):
            choices.append(spdx)
    # Prefer a CC license, which matches UD's CC BY-SA default.
    return min(choices, key=lambda spdx: spdx == "MIT", default=None)


FRONTMATTER = re.compile(r"^---\n(.*?)\n---\n?(.*)$", re.DOTALL)

CODE_BLOCK = re.compile(r"^```.*?^```[^\n]*$", re.MULTILINE | re.DOTALL)
IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
FOOTNOTE_REF = re.compile(r"\[\^[^\]]+\](?!:)")
FOOTNOTE_DEF = re.compile(r"^\[\^[^\]]+\]:\s*", re.MULTILINE)
BREAK_TAG = re.compile(
    r"<br\s*/?>|</?(?:p|div|li|h\d|blockquote)\b[^>]*>", re.IGNORECASE
)
TAG = re.compile(r"<[^>]+>")
ADMONITION = re.compile(r"^!!!.*$", re.MULTILINE)
QUOTE_PREFIX = re.compile(r"^(?:>\s?)+", re.MULTILINE)
TABLE_ROW = re.compile(r"^\s*\|.*$", re.MULTILINE)
HEADING = re.compile(r"^#{1,6}\s+", re.MULTILINE)
LIST_MARKER = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+", re.MULTILINE)
# A label and colon at the start of a line.
# - Followed by the text it labels on the same line
# - For names and bold labels they may be on the next line
LABEL = (
    r"(?:\*\*|__)[^*_\n:]{1,40}:(?:\*\*|__)"  # **jan Tepo:**
    r"|(?:\*\*|__)[^*_\n:]{1,40}(?:\*\*|__):"  # **jan Tepo**:
    r"|[a-z]+(?: [A-Z][\w'’-]*)+:"  # jan Tepo:
)
CAPS_LABEL = r"[A-Z]{2,}(?: [A-Z]{2,}){0,5}:"  # SITELEN NANPA WAN:
SPEAKER = re.compile(
    rf"^(?:(?:{LABEL})(?:[ \t]+|[ \t]*\\?[ \t]*\n)|{CAPS_LABEL}[ \t]+)(?=[ \t]*\S)",
    re.MULTILINE,
)
# Prose wrapped at a fixed width, where line breaks fall mid-sentence. Found by
# ranking texts by lines that end a sentence partway through but not at the end.
HARD_WRAPPED = {"2022/07/sona-sin-pona-tan-jan-sewi-jojane.md"}

HARD_BREAK = re.compile(r"[ \t]*\\?[ \t]*$", re.MULTILINE)
ESCAPE = re.compile(r"\\([\\`*_{}\[\]()#+\-.!|~<>\"'])")


def plain_paragraphs(body: str) -> list[str]:
    """Markdown body to plain-text paragraphs. Emphasis is left for 1_segment.py."""
    body = CODE_BLOCK.sub("\n\n", body)
    body = IMAGE.sub(" ", body)
    body = LINK.sub(r"\1", body)
    body = FOOTNOTE_REF.sub("", body)
    body = FOOTNOTE_DEF.sub("\n\n", body)
    body = BREAK_TAG.sub("\n", body)
    body = TAG.sub("", body)
    body = QUOTE_PREFIX.sub("", body)
    body = ADMONITION.sub("", body)
    body = TABLE_ROW.sub("", body)
    body = HEADING.sub("", body)
    body = LIST_MARKER.sub("", body)
    body = SPEAKER.sub("", body)
    body = HARD_BREAK.sub("", body)
    body = ESCAPE.sub(r"\1", body)
    body = html.unescape(body)
    paragraphs = (p.strip() for p in re.split(r"\n\s*\n", body))
    return [p for p in paragraphs if p]


def main():
    out_dir = Path(sys.argv[1])
    plaintext = Path(sys.argv[2]) / "plaintext"
    if not plaintext.is_dir():
        sys.exit(
            f"{plaintext} not found; POKI should be a clone of the poki Lapo repository"
        )
    out_dir.mkdir(parents=True, exist_ok=True)

    licenses = Counter()
    total = paragraphs = 0
    with (out_dir / "poki.jsonl").open("w") as output:
        for path in sorted(plaintext.rglob("*.md")):
            total += 1
            match = FRONTMATTER.match(path.read_text(encoding="utf-8"))
            if not match:
                print(f"skipping {path}: no frontmatter", file=sys.stderr)
                continue
            try:
                meta = yaml.safe_load(match.group(1))
            except yaml.YAMLError as error:
                print(f"skipping {path}: {error.problem}", file=sys.stderr)
                continue
            license = normalize_license(meta.get("license"))
            if license is None:
                continue
            licenses[license] += 1
            name = path.relative_to(plaintext).as_posix()
            for n, content in enumerate(plain_paragraphs(match.group(2)), 1):
                if name in HARD_WRAPPED:
                    content = re.sub(r"[ \t]*\n[ \t]*", " ", content)
                record = {
                    "id": f"{name}#{n}",
                    "title": meta["title"],
                    "authors": meta.get("authors"),
                    "original": meta.get("original"),
                    "date": meta.get("date"),
                    "license": license,
                    "sources": meta.get("sources"),
                    "content": content,
                }
                output.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
                paragraphs += 1

    print(f"kept {licenses.total()}/{total} texts, {paragraphs} paragraphs")
    for license, count in licenses.most_common():
        print(f"  {license}: {count}")


if __name__ == "__main__":
    main()
