"""Merge DiscordChatExporter JSON exports into one JSONL file per channel.

Usage: python pipeline/0_aggregate.py OUT_DIR SOURCE...

- Each SOURCE is a directory of exports or a .zip of them searched recursively.
- Later sources win when a message ID appears twice.
- Messages with no text are dropped.
- Output is OUT_DIR/<channel>.jsonl, sorted by message ID, one object per line:

    id, authorId, authorName, authorKind, replyTo, content

- authorKind is "user", "webhook" (PluralKit/Tupperbox proxies), or "bot".
- We keep authorName for the "webhook" case.
- @-mentions in content are replaced with @USER.
"""

import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path, PurePosixPath

CHANNEL_ID = re.compile(r"\[(\d+)\](?: \(after [^)]*\))?(?: \[part \d+\])?\.json$")


def find_exports(source: Path):
    """Yield (channel_id, open_fn) for each export file in a directory or zip."""
    if source.suffix == ".zip":
        archive = zipfile.ZipFile(source)
        names = sorted(n for n in archive.namelist() if n.endswith(".json"))
        for name in names:
            if "broken" in PurePosixPath(name).parts:
                continue
            if match := CHANNEL_ID.search(name):
                yield match.group(1), lambda name=name: archive.open(name)
    else:
        for path in sorted(source.rglob("*.json")):
            if "broken" in path.relative_to(source).parts:
                continue
            if match := CHANNEL_ID.search(path.name):
                yield match.group(1), lambda path=path: path.open("rb")


LEFTOVER_MENTION = re.compile(r"(?<![\w@])@(?!USER\b)[^\s@]+")


def anonymize_mentions(content, mentions):
    """Replace @-mentions with @USER, using exact names first since they can contain spaces."""
    names = {n for u in mentions for n in (u["name"], u["nickname"]) if n}
    for name in sorted(names, key=len, reverse=True):
        content = content.replace("@" + name, "@USER")
    return LEFTOVER_MENTION.sub("@USER", content)


def author_kind(author):
    if not author["isBot"]:
        return "user"
    return "webhook" if author["discriminator"] == "0000" else "bot"


def main():
    out = Path(sys.argv[1])
    sources = [Path(s) for s in sys.argv[2:]]
    out.mkdir(parents=True, exist_ok=True)

    exports = defaultdict(list)
    for source in sources:
        for channel_id, open_fn in find_exports(source):
            exports[channel_id].append(open_fn)

    for channel_id, open_fns in exports.items():
        messages = {}
        name = channel_id
        for open_fn in open_fns:
            with open_fn() as file:
                export = json.load(file)
            name = export["channel"]["name"]
            for m in export["messages"]:
                message_id = int(m["id"])
                if not m["content"]:
                    messages.pop(message_id, None)
                    continue
                author = m["author"]
                reply_to = (m.get("reference") or {}).get("messageId")
                messages[message_id] = (
                    int(author["id"]),
                    author["name"],
                    author_kind(author),
                    int(reply_to) if reply_to else None,
                    anonymize_mentions(m["content"], m["mentions"]),
                )

        target = out / f"{name}.jsonl"
        with target.open("w") as file:
            for message_id in sorted(messages):
                author_id, author_name, kind, reply_to, content = messages[message_id]
                record = {
                    "id": message_id,
                    "authorId": author_id,
                    "authorName": author_name,
                    "authorKind": kind,
                    "replyTo": reply_to,
                    "content": content,
                }
                file.write(json.dumps(record, ensure_ascii=False) + "\n")
        print(
            f"{target.name}: {len(messages)} messages from {len(open_fns)} files",
            flush=True,
        )


if __name__ == "__main__":
    main()
