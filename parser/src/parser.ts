import nearley from "nearley";

import grammar from "./grammar.js";
import type { Input } from "./lex.js";
import { isModifier } from "./tree.js";
import type { PhraseLabel, Tree } from "./types.js";

export interface Result {
	tree: Tree;
	/** Probability of this parse relative to the others (softmax of scores). */
	score: number;
}

/**
 * Parses a sentence, given as text or tokens, into every possible tree, most
 * likely first. Throws on a syntax error; returns `[]` if the sentence ends
 * early.
 */
export function parse(input: Input): Result[] {
	// The lexer accepts tokens too, though nearley's types only allow strings.
	const parser = new nearley.Parser(
		nearley.Grammar.fromCompiled(grammar),
	).feed(input as string);

	const scored = (parser.results as Tree[])
		.map((tree) => ({ tree, score: scoreTree(tree) }))
		.sort((a, b) => b.score - a.score);

	const sum = scored.reduce((acc, r) => acc + Math.exp(r.score), 0);
	return scored.map((r) => ({
		tree: r.tree,
		score: Math.exp(r.score) / sum,
	}));
}

const goodLabels = new Set<PhraseLabel>([
	"ordinal",
	"preverb_phrase",
	"preposition_phrase",
	"verb_phrase_intransitive",
	"verb_phrase_transitive",
	"verb_phrase_prepositional",
]);

// These words are rarely heads.
const unlikelyHeads = new Set(["ala", "taso", "kin", "n"]);

function scoreTree(tree: Tree, modifier = false): number {
	if (tree.type === "word") {
		if (tree.role === "sentence_starter") return 1;
		if (
			tree.role === "content" &&
			!modifier &&
			unlikelyHeads.has(tree.text)
		) {
			return -1.5;
		}
		return 0;
	}

	let score = goodLabels.has(tree.label) ? 1 : 0;
	tree.children.forEach((child, i) => {
		score += scoreTree(child, isModifier(tree, i));
	});
	return score;
}
