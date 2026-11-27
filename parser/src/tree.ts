// Tree constructors used by grammar.ne, and helpers for reading trees.

import type { Token } from "./lex.js";
import {
	phraseLabels,
	wordRoles,
	type Phrase,
	type PhraseLabel,
	type Tree,
	type Word,
	type WordRole,
} from "./types.js";

// The generated grammar is untyped, so catch typos when it loads.
function check<T extends string>(valid: readonly T[], value: string): T {
	if (!(valid as readonly string[]).includes(value)) {
		throw new Error(`Invalid label or role: ${value}`);
	}
	return value as T;
}

function phrase(
	label: PhraseLabel,
	children: Tree[],
	head: number | null,
): Phrase {
	return { type: "phrase", label, children, head };
}

/**
 * If the rule ends in an optional emphatic "a" (`WordEmphasis:?`)
 * and it is present, returns an `emphasized` phrase headed by the word instead of just the word.
 */
export function makeWord(roleName: string) {
	const role = check<WordRole>(wordRoles, roleName);
	return ([token, emphasis]: [Token, Word | null | undefined]): Tree => {
		const word: Word = {
			type: "word",
			role,
			text: token.written,
			position: token.position,
			...(token.offset !== undefined && { offset: token.offset }),
		};
		return emphasis ? phrase("emphasized", [word, emphasis], 0) : word;
	};
}

/** A phrase whose children are the rule's symbols. */
export function makeNode(labelName: string, head: number | null) {
	const label = check<PhraseLabel>(phraseLabels, labelName);
	return (children: Tree[]) => phrase(label, children, head);
}

/** A phrase whose children are a repeated symbol (`X:+`). */
export function makeList(labelName: string, head: number | null) {
	const label = check<PhraseLabel>(phraseLabels, labelName);
	return ([children]: [Tree[]]) => phrase(label, children, head);
}

/** Like `makeList`, but a single item is returned as is. */
export function makeOptionalList(labelName: string, head: number | null) {
	const list = makeList(labelName, head);
	return ([children]: [Tree[]]): Tree =>
		children.length === 1 ? children[0]! : list([children]);
}

/**
 * For right-recursive coordination (`X -> Item X`): prepends `first` to
 * `rest`, flattening `rest` if it is the same kind of list. The first
 * conjunct is the head.
 */
export function makeCoordination(labelName: string) {
	const label = check<PhraseLabel>(phraseLabels, labelName);
	return ([first, rest]: [Tree, Tree]) =>
		phrase(
			label,
			rest.type === "phrase" && rest.label === label
				? [first, ...rest.children]
				: [first, rest],
			0,
		);
}

/** Follows head children down to the word that heads `tree`. */
export function headWord(tree: Tree): Word {
	while (tree.type === "phrase") {
		if (tree.head === null) {
			throw new Error(`'${tree.label}' has no head`);
		}
		tree = tree.children[tree.head]!;
	}
	return tree;
}

/** Whether child `index` of `parent` is a modifier of the phrase's head. */
export function isModifier(parent: Phrase | null, index: number): boolean {
	return parent?.label === "phrase" && parent.head !== index;
}
