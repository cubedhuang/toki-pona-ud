import type { Label, Tree, Word } from "./types.js";

export type Tag =
	| "noun"
	| "tverb"
	| "iverb"
	| "modifier"
	| "particle"
	| "preposition"
	| "preverb"
	| "interjection_head";

export interface TaggedWord {
	word: Word;
	tag: Tag;
}

/** What a content word heading the current phrase would be. */
type HeadRole = "interjection" | "noun" | "tverb" | "iverb";

const headTags: Record<HeadRole, Tag> = {
	interjection: "interjection_head",
	noun: "noun",
	tverb: "tverb",
	iverb: "iverb",
};

function headRoleOf(label: Label): HeadRole | undefined {
	if (label.startsWith("clause") || label === "object_phrase") return "noun";
	if (label === "verb_phrase_transitive") return "tverb";
	if (
		label === "verb_phrase_intransitive" ||
		label === "verb_phrase_prepositional"
	) {
		return "iverb";
	}
	return undefined;
}

/** Tags each word in a tree with its part of speech, in order. */
export function tagTree(
	tree: Tree,
	role: HeadRole = "interjection",
	inHead = false,
): TaggedWord[] {
	role = headRoleOf(tree.label) ?? role;
	inHead ||= tree.label === "head";

	if (tree.type === "node") {
		return tree.children.flatMap((child) => tagTree(child, role, inHead));
	}

	return [{ word: tree.word, tag: tagWord(tree.label, role, inHead) }];
}

function tagWord(label: Label, role: HeadRole, inHead: boolean): Tag {
	switch (label) {
		case "prep":
			return "preposition";
		case "pv":
			return "preverb";
		case "cont":
			return inHead ? headTags[role] : "modifier";
		default:
			return "particle";
	}
}
