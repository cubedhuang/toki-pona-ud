// Postprocessors used by grammar.ne to build trees.

import type { Token } from "./lex.js";
import {
	labels,
	type Label,
	type Leaf,
	type Node,
	type Tree,
} from "./types.js";

const labelSet = new Set<string>(labels);

// The generated grammar is untyped, so catch label typos when it loads.
function checkLabel(label: string): Label {
	if (!labelSet.has(label)) {
		throw new Error(`Invalid label: ${label}`);
	}
	return label as Label;
}

/** A word, with an optional trailing emphatic "a". */
export function makeLeaf(label: string) {
	checkLabel(label);
	return ([token, emphasis]: [Token, Leaf | null | undefined]): Leaf => ({
		type: "leaf",
		label: label as Label,
		word: { index: token.index, text: token.value },
		...(emphasis ? { emphasis } : {}),
	});
}

/** A node whose children are the rule's symbols. */
export function makeNode(label: string) {
	checkLabel(label);
	return (children: Tree[]): Node => ({
		type: "node",
		label: label as Label,
		children,
	});
}

/** A node whose children are a repeated symbol (`X:+`). */
export function makeList(label: string) {
	checkLabel(label);
	return ([children]: [Tree[]]): Node => ({
		type: "node",
		label: label as Label,
		children,
	});
}

/** Like `makeList`, but a single item is returned as is. */
export function makeOptionalList(label: string) {
	const list = makeList(label);
	return ([children]: [Tree[]]): Tree =>
		children.length === 1 ? children[0]! : list([children]);
}

/**
 * For right-recursive coordination (`X -> Item X`): prepends `first` to
 * `rest`, flattening `rest` if it is the same kind of list.
 */
export function makeCoordination(label: string) {
	checkLabel(label);
	return ([first, rest]: [Tree, Tree]): Node => ({
		type: "node",
		label: label as Label,
		children:
			rest.type === "node" && rest.label === label
				? [first, ...rest.children]
				: [first, rest],
	});
}
