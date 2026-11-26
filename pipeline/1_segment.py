"""Split messages into Toki Pona sentences with sonatoki.

Usage: python pipeline/1_segment.py IN_DIR OUT_DIR

Reads IN_DIR/<channel>.jsonl from 0_aggregate.py.
Writes OUT_DIR/<channel>.jsonl with one line per message that has at least one kept sentence.
- Bot messages are skipped.
- Each line keeps the message metadata but `content` is replaced with `sentences`.

    {"text": original sentence, "tokens": sonatoki tokens, "score": sonatoki score}
"""

import json
import sys
from multiprocessing import Pool
from pathlib import Path

from sonatoki.Configs import CorpusConfig
from sonatoki.ilo import Ilo

MIN_MESSAGE_SCORE = 0.1  # drop messages that are barely Toki Pona
MIN_SENTENCE_SCORE = 0.8
MIN_WORDS = 3  # short sentences pass only if the message as a whole is
MIN_MESSAGE_SCORE_FOR_SHORT = 0.3  # Toki Pona enough

ILO = Ilo(**CorpusConfig)


def segment(line: str) -> str | None:
    message = json.loads(line)
    if message["authorKind"] == "bot":
        return None
    content = message.pop("content")
    message_score = ILO.make_scorecard(content)["score"]
    if message_score <= MIN_MESSAGE_SCORE:
        return None

    sentences = []
    for card in ILO.make_scorecards(content):
        words = card["filtered"]
        if not words or card["score"] < MIN_SENTENCE_SCORE:
            continue
        if len(words) < MIN_WORDS and message_score < MIN_MESSAGE_SCORE_FOR_SHORT:
            continue
        sentences.append(
            {
                "text": card["text"].strip(),
                "tokens": card["tokenized"],
                "score": card["score"],
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
