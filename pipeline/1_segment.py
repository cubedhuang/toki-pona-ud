"""Split messages into Toki Pona sentences with sonatoki.

Usage: python pipeline/1_segment.py IN_DIR OUT_DIR

Reads IN_DIR/*.jsonl from 0_aggregate.py (Discord) or 0_poki.py (poki Lapo).
Writes OUT_DIR/<same name>.jsonl with one line per message that has at least one kept sentence.
- Bot messages are skipped. poki Lapo paragraphs count as messages.
- Discord markup, code, quoted (`> `) lines, struck-through text and custom emoji are removed
  first. Sentences written with sitelen pona word emoji (:zz_pona:) are dropped.
- A line break ends a sentence unless the sentence clearly goes on: the line ends with a comma
  or with li, e, la, pi, en, anu or o, or the next line starts with li, e, la, pi, en or anu.
  Such lines are joined with a space first. See join_lines.
- Sentences end at . ? ! : ; … and newlines, but not at brackets or dashes. A bracket opened
  in the middle of a sentence keeps everything up to its closing bracket in that sentence, even
  across sentence punctuation. A bracket opened at the start of a sentence doesn't, so
  `(ona li pona. sina seme?)` is two sentences, like it would be without the brackets.
  Closing brackets and quotes and repeated punctuation (`!!`, `...`) stay with the sentence
  they close.
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
from sonatoki.Tokenizers import SentTokenizer

MIN_MESSAGE_SCORE = 0.1  # drop messages that are barely Toki Pona
MIN_SENTENCE_SCORE = 0.8
MIN_WORDS = 3  # short sentences pass only if the message as a whole is
MIN_MESSAGE_SCORE_FOR_SHORT = 0.3  # Toki Pona enough

CLOSERS = set(")]}”»›」』")


class Sentences(SentTokenizer):
    """sonatoki's sentence splitter, minus brackets and dashes as sentence boundaries."""

    delimiters = SentTokenizer.delimiters - set("()[]-")

    @classmethod
    def tokenize(cls, s: str) -> list[str]:
        sentences = []
        pieces = super().tokenize(s)
        for i, sentence in enumerate(pieces):
            if sentences and sentences[-1][-1] in cls.delimiters | CLOSERS:
                carried = carried_over(sentence, sentences[-1])
                sentences[-1] += sentence[:carried]
                sentence = sentence[carried:].strip()
            if not sentence:
                continue
            # A bracket opened mid-sentence that closes later in the message keeps
            # everything up to it together.
            if sentences and interrupting(sentences[-1]) & set("".join(pieces[i:])):
                sentences[-1] += " " + sentence
            else:
                sentences.append(sentence)
        return sentences


BRACKETS = {"(": ")", "[": "]"}


def interrupting(sentence: str) -> set[str]:
    """Closing brackets still owed by `sentence` for brackets opened after its start."""
    opened = []  # (index, closer) of brackets not closed yet
    for i, char in enumerate(sentence):
        if char in BRACKETS:
            opened.append((i, BRACKETS[char]))
        elif opened and char == opened[-1][1]:
            opened.pop()
    return {close for i, close in opened if i > 0}


def carried_over(sentence: str, previous: str) -> int:
    """How many leading characters of `sentence` close `previous` instead."""
    quotes = previous.count('"')
    for i, char in enumerate(sentence):
        if char == '"' and quotes % 2:
            quotes += 1
        elif char not in Sentences.delimiters | CLOSERS:
            return i
    return len(sentence)


ILO = Ilo(**CorpusConfig, sent_tokenizer=Sentences)

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


CANT_END = {"li", "e", "la", "pi", "en", "anu", "o"}
CANT_BEGIN = CANT_END - {"o"}
ENDS_SENTENCE = re.compile(r"[.!?:;…][)\]}\"'”’»›」』]*[ \t]*$")
WORD = re.compile(r"[^\W\d_]+")


def continues(line: str, following: str) -> bool:
    """Whether a sentence clearly goes on from `line` to the `following` line."""
    if ENDS_SENTENCE.search(line):
        return False
    if re.search(r",[ \t]*$", line):
        return True
    last = WORD.findall(line)[-1:]
    first = WORD.findall(following)[:1]
    return (last and last[0].lower() in CANT_END) or (
        first and first[0].lower() in CANT_BEGIN
    )


def join_lines(content: str) -> str:
    """Join lines across which a sentence goes on, so the break doesn't split it.

    A line break otherwise ends a sentence: in verse, lists and dialogue, each
    line is usually one. Breaks with nothing on one side are left alone.
    """
    lines = content.split("\n")
    joined = [lines[0]]
    for line in lines[1:]:
        previous = joined[-1]
        if previous.strip() and line.strip() and continues(previous, line):
            joined[-1] = previous.rstrip() + " " + line.lstrip()
        else:
            joined.append(line)
    return "\n".join(joined)


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
    content = join_lines(clean(message.pop("content")))
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
        sentence_score = (
            score(card["text"]) if "USER" in card["filtered"] else card["score"]
        )
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
