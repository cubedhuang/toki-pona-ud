from dataclasses import asdict, dataclass
import heapq
import json
import os


@dataclass(order=True)
class Message:
    id: int
    authorId: int
    content: str


def get_dir_files(name):
    dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(dir, name)

    files = []
    for entry in os.listdir(path):
        full_path = os.path.join(path, entry)
        if os.path.isfile(full_path):
            files.append(full_path)
    return files


def add_messages(messages, path):
    with open(path) as file:
        data = json.load(file)
        for raw_message in data["messages"]:
            if len(raw_message["content"]) == 0 or raw_message["author"]["isBot"]:
                continue
            message = Message(
                id=int(raw_message["id"]),
                authorId=int(raw_message["author"]["id"]),
                content=raw_message["content"],
            )
            heapq.heappush(messages, message)


def write_messages(messages, path):
    dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(dir, path)
    with open(path, "w") as output:
        while len(messages):
            message = heapq.heappop(messages)
            output.write(json.dumps(asdict(message)) + "\n")


if __name__ == "__main__":
    files = get_dir_files("files") + get_dir_files("more-files")

    messages: list[Message] = []
    for file in files:
        add_messages(messages, file)
        print(f"added {os.path.basename(file)}")

    write_messages(messages, "0.aggregated.jsonl")
