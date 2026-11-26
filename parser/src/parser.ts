import nearley from "nearley";

import grammar from "./grammar.js";
import type { Label, Tree } from "./types.js";

export interface Result {
	tree: Tree;
	/** Probability of this parse relative to the others (softmax of scores). */
	score: number;
}

/**
 * Parses a sentence into every possible tree, most likely first. Throws on a
 * syntax error; returns `[]` if the sentence ends early.
 */
export function parse(text: string): Result[] {
	const parser = new nearley.Parser(
		nearley.Grammar.fromCompiled(grammar),
	).feed(text);

	const scored = (parser.results as Tree[])
		.map((tree) => ({ tree, score: scoreTree(tree) }))
		.sort((a, b) => b.score - a.score);

	const sum = scored.reduce((acc, r) => acc + Math.exp(r.score), 0);
	return scored.map((r) => ({
		tree: r.tree,
		score: Math.exp(r.score) / sum,
	}));
}

const goodLabels = new Set<Label>([
	"ordinal",
	"preverb_phrase",
	"preposition_phrase",
	"verb_phrase_intransitive",
	"verb_phrase_transitive",
	"verb_phrase_prepositional",
	"start",
]);

// These words are rarely heads.
const unlikelyHeads = new Set(["ala", "taso", "kin", "n"]);

function scoreTree(tree: Tree): number {
	let score = goodLabels.has(tree.label) ? 1 : 0;

	if (tree.type === "leaf") return score;

	const [child] = tree.children;
	if (
		tree.label === "head" &&
		tree.children.length === 1 &&
		child!.type === "leaf" &&
		unlikelyHeads.has(child!.word.text)
	) {
		score -= 1.5;
	}

	for (const child of tree.children) score += scoreTree(child);
	return score;
}
