import { isModifier } from "./tree.js";
import type { PhraseLabel, Tree, Word, WordRole } from "./types.js";

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

function headRoleOf(label: PhraseLabel): HeadRole | undefined {
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
	modifier = false,
): TaggedWord[] {
	if (tree.type === "word") {
		return [{ word: tree, tag: tagWord(tree.role, role, modifier) }];
	}

	role = headRoleOf(tree.label) ?? role;
	return tree.children.flatMap((child, i) =>
		tagTree(child, role, isModifier(tree, i)),
	);
}

function tagWord(wordRole: WordRole, role: HeadRole, modifier: boolean): Tag {
	switch (wordRole) {
		case "preposition":
			return "preposition";
		case "preverb":
			return "preverb";
		case "content":
			return modifier ? "modifier" : headTags[role];
		default:
			return "particle";
	}
}
