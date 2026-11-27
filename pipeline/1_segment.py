"""Split messages into Toki Pona sentences with sonatoki.

Usage: python pipeline/1_segment.py IN_DIR OUT_DIR

Reads IN_DIR/*.jsonl from 0_aggregate.py (Discord) or 0_poki.py (poki Lapo).
Writes OUT_DIR/<same name>.jsonl with one line per message that has at least one kept sentence.
- Bot messages are skipped. poki Lapo paragraphs count as messages.
- Discord markup, code, quoted (`> `) lines, struck-through text and custom emoji are removed
  first. Sentences written with sitelen pona word emoji (:zz_pona:) are dropped.
- Each line keeps the message metadata but `content` is replaced with `sentences`.

    {"text": original sentence, "tokens": sonatoki tokens, "score": sonatoki score}
"""

import json
import re
import sys
from multiprocessing import Pool
from pathlib import Path

from sonatoki.Configs import CorpusConfig
from sonatoki.constants import words_by_tag
from sonatoki.ilo import Ilo

MIN_MESSAGE_SCORE = 0.1  # drop messages that are barely Toki Pona
MIN_SENTENCE_SCORE = 0.8
MIN_WORDS = 3  # short sentences pass only if the message as a whole is
MIN_MESSAGE_SCORE_FOR_SHORT = 0.3  # Toki Pona enough

ILO = Ilo(**CorpusConfig)

TOKI_PONA_WORDS = {
    word
    for category in ("core", "common", "uncommon", "obscure")
    for word in words_by_tag("usage_category", category)
}

MENTION = "@USER"
# Stands in for a sitelen pona word emoji until sentences are split, so the
# sentence it was in can be dropped instead of silently losing a word.
WORD_EMOJI = "WORDEMOJI"
PLACEHOLDERS = re.compile(rf"{MENTION}|{WORD_EMOJI}")

CODE = re.compile(r"```.*?```|`[^`\n]*`", re.DOTALL)
QUOTE_LINE = re.compile(r"^(?:-# )?>.*$", re.MULTILINE)
LINE_PREFIX = re.compile(r"^(?:-# |#{1,3} )", re.MULTILINE)
STRIKETHROUGH = re.compile(r"~~.*?~~", re.DOTALL)
EMPHASIS = re.compile(r"\*+|__|\|\||(?<!\w)_|_(?!\w)")
CUSTOM_EMOJI = re.compile(r"<a?:(\w+):\d+>|:([A-Za-z][A-Za-z0-9_~]*):")
EMOJI_PREFIX = re.compile(r"^(?:zz_|z_|sp_|z)")


def emoji_word(name: str) -> str | None:
    """The Toki Pona word a sitelen pona emoji like :zz_pona: or :sp_li: spells."""
    name = name.lower().rstrip("0123456789")
    if name in TOKI_PONA_WORDS:
        return name
    stripped = EMOJI_PREFIX.sub("", name)
    return stripped if stripped in TOKI_PONA_WORDS else None


def replace_emoji(match: re.Match) -> str:
    name = match.group(1) or match.group(2)
    return f" {WORD_EMOJI} " if emoji_word(name) else " "


def clean(content: str) -> str:
    """Remove Discord markup, quoted lines, code and custom emoji."""
    content = CODE.sub(" ", content)
    content = QUOTE_LINE.sub("", content)
    content = LINE_PREFIX.sub("", content)
    content = STRIKETHROUGH.sub(" ", content)
    content = CUSTOM_EMOJI.sub(replace_emoji, content)
    return EMPHASIS.sub("", content)


def score(text: str) -> float:
    """sonatoki's score, ignoring placeholders it doesn't know."""
    return ILO.make_scorecard(PLACEHOLDERS.sub(" ", text))["score"]


def merge_mentions(tokens: list[str]) -> list[str]:
    """Rejoin sonatoki's "@", "USER" (or "`@", "USER") into one @USER token."""
    merged = []
    for token in tokens:
        if token == "USER" and merged and merged[-1].endswith("@"):
            rest = merged.pop()[:-1]
            if rest:
                merged.append(rest)
            merged.append(MENTION)
        else:
            merged.append(token)
    return merged


def segment(line: str) -> str | None:
    message = json.loads(line)
    if message.get("authorKind") == "bot":
        return None
    content = clean(message.pop("content"))
    message_score = score(content)
    if message_score <= MIN_MESSAGE_SCORE:
        return None

    sentences = []
    for card in ILO.make_scorecards(content):
        if WORD_EMOJI in card["tokenized"]:
            continue
        words = [w for w in card["filtered"] if w != "USER"]
        if not words:
            continue
        sentence_score = score(card["text"]) if "USER" in card["filtered"] else card["score"]
        if sentence_score < MIN_SENTENCE_SCORE:
            continue
        if len(words) < MIN_WORDS and message_score < MIN_MESSAGE_SCORE_FOR_SHORT:
            continue
        sentences.append(
            {
                "text": " ".join(card["text"].split()),
                "tokens": merge_mentions(card["tokenized"]),
                "score": sentence_score,
            }
        )
    if not sentences:
        return None
    message["sentences"] = sentences
    return json.dumps(message, ensure_ascii=False)


def main():
    in_dir = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    with Pool() as pool:
        for source in sorted(in_dir.glob("*.jsonl")):
            kept = total = 0
            with source.open() as lines, (out_dir / source.name).open("w") as output:
                for result in pool.imap(segment, lines, chunksize=2000):
                    total += 1
                    if result is not None:
                        kept += 1
                        output.write(result + "\n")
            print(f"{source.name}: kept {kept}/{total} messages", flush=True)


if __name__ == "__main__":
    main()
