import nearley from "nearley";

import grammar from "./grammar.js";
import {
	contentOf,
	isForeign,
	keepOnly,
	maskParentheticals,
	parentheticals,
	prepositions,
	segments,
	tokenize,
	type Input,
	type TokensWithText,
	TokiPonaLexer,
} from "./lex.js";
import { headWord, isModifier } from "./tree.js";
import type { PhraseLabel, Tree, Word } from "./types.js";
import { lexicon } from "./wordClasses.js";

export interface Result {
	tree: Tree;
	/** Probability of this parse relative to the others (softmax of scores). */
	score: number;
}

/**
 * Parses a sentence, given as text or tokens, into every possible tree, most
 * likely first. Word positions are token indices, as from `tokenize`. Throws
 * on a syntax error; returns `[]` if the sentence ends early.
 *
 * Words in brackets are left out of the tree, and `toUD` parses them
 * separately, unless the sentence only parses with them, as in "kama jo (e)
 * moku". With tokens, `text`, if given, tells where the spaces are, which
 * decides whether a slash joins alternatives (wile/alasa).
 */
export function parse(input: Input, text?: string): Result[] {
	// Text is split into tokens first, so it's parsed the same way.
	if (typeof input === "string") return parse(tokenize(input), input);
	const masked = maskParentheticals(input);
	if (masked === input) return parseAll(input, text);
	const results = tryParse(masked, text);
	if (results.length === 0) return parseAll(input, text);
	if (
		parentheticals(input).every(([a, b]) => parsesAlone(input, a, b, text))
	) {
		return results;
	}
	const whole = tryParse(input, text);
	return whole.length ? whole : results;
}

function tryParse(input: Input, text?: string): Result[] {
	try {
		return parseAll(input, text);
	} catch {
		return [];
	}
}

/** Whether each Toki Pona alternative in a parenthetical parses on its own. */
function parsesAlone(
	tokens: readonly string[],
	open: number,
	close: number,
	text?: string,
) {
	return segments(tokens, open, close).every((segment) => {
		const content = contentOf(tokens, segment);
		return (
			content.length === 0 ||
			isForeign(tokens, content) ||
			tryParse(keepOnly(tokens, segment), text).length > 0
		);
	});
}

function parseAll(input: Input, text?: string): Result[] {
	const fed: Input | TokensWithText =
		typeof input === "string" || text === undefined
			? input
			: { tokens: input, text };
	const compiled = nearley.Grammar.fromCompiled(grammar);
	const lexer = new BudgetedLexer();
	compiled.lexer = lexer;
	const parser = new nearley.Parser(compiled);
	lexer.parser = parser;
	try {
		// The lexer accepts tokens too, though nearley's types only allow strings.
		parser.feed(fed as string);
	} catch (e) {
		if (lexer.exceeded) throw new AmbiguityError();
		throw e;
	}

	const scored = (parser.results as Tree[])
		.map((tree) => ({ tree, score: scoreTree(tree) }))
		.sort((a, b) => b.score - a.score);

	return scored.map((r) => ({
		tree: r.tree,
		score: r.score,
	}));
}

export class AmbiguityError extends Error {
	constructor() {
		super("Too many possible parses");
		this.name = "AmbiguityError";
	}
}

// nearley keeps every reading apart, so a sentence whose readings multiply
// with each phrase fills the chart exponentially. In poki Lapo, no sentence of up
// to 30 words needs more than about 3,700 states in a column.
const MAX_STATES = 50_000;

class BudgetedLexer extends TokiPonaLexer {
	parser?: nearley.Parser;
	exceeded = false;

	override next() {
		// nearley asks for the next token once the current column is done.
		const parser = this.parser as
			| (nearley.Parser & { table: { states: unknown[] }[] })
			| undefined;
		if (
			parser &&
			parser.table[parser.current]!.states.length > MAX_STATES
		) {
			this.exceeded = true;
			throw new AmbiguityError();
		}
		return super.next();
	}
}

const goodLabels = new Set<PhraseLabel>([
	"ordinal",
	"preverb_phrase",
	"preposition_phrase",
	"verb_phrase_intransitive",
	"verb_phrase_transitive",
	"verb_phrase_prepositional",
]);

// "olin o, mi lon", "olin o, ona li lon"
const vocativeClauses = new Set<PhraseLabel>([
	"clause_marked_subject",
	"clause_unmarked_subject",
]);

/** The clause under any sentence starters and la phrases. */
function innerClause(tree: Tree): Tree {
	while (tree.type === "phrase" && tree.label === "clause") {
		tree = tree.children[tree.head!]!;
	}
	return tree;
}

// These words are rarely heads.
const unlikelyHeads = new Set(["ala", "taso", "kin", "n"]);

/** Whether the trees all have the same head word. */
function sameHead(trees: Tree[]): boolean {
	const heads = trees.map((t) => headWord(t).text.toLowerCase());
	return heads.every((h) => h === heads[0]);
}

function leftmostWord(tree: Tree): Word {
	return tree.type === "word" ? tree : leftmostWord(tree.children[0]!);
}

/** Whether `tree` adds a pi group to a phrase that already ends in one. */
function stacksPi(tree: Tree): boolean {
	if (tree.type !== "phrase" || tree.label !== "phrase") return false;
	const [left, right] = tree.children;
	const isPi = (t: Tree | undefined) =>
		t?.type === "phrase" && t.label === "pi";
	return (
		isPi(right) &&
		left?.type === "phrase" &&
		left.label === "phrase" &&
		isPi(left.children.at(-1))
	);
}

function scoreTree(tree: Tree, modifier = false): number {
	if (tree.type === "word") {
		if (tree.role === "sentence_starter") return 1;
		if (
			tree.role === "content" &&
			!modifier &&
			unlikelyHeads.has(tree.text.toLowerCase())
		) {
			return -2;
		}
		return 0;
	}

	let score = goodLabels.has(tree.label) ? 1 : 0;
	// slightly prefer nested pi
	if (stacksPi(tree)) score -= 0.25;

	// Options of anu with the same head are parallel: in mi lukin e poki loje
	// anu poki laso, anu joins the two objects, not two predicates. This beats
	// the preference for a second predicate.
	if (tree.label === "& disjuncts" && sameHead(tree.children)) score += 1.5;

	// sona/lukin before a word with no verb sense is a verb with a modifier, not a
	// preverb: mi sona pona e nasin "I know the way well".
	if (tree.label === "preverb_phrase") {
		const preverb = leftmostWord(tree.children[0]!);
		const next = headWord(tree.children[1]!);
		const classes = lexicon[next.text.toLowerCase()] ?? [];
		if (
			preverb.text.toLowerCase() === "sona" &&
			preverb.text.toLowerCase() === "lukin" &&
			!classes.includes("VERB")
		) {
			score -= 1.5;
		}
	}

	// A preposition phrase rarely has one inside its object: in mi tawa lon
	// ma, tawa is the verb and lon ma its own phrase.
	if (tree.label === "preposition_phrase") {
		const first = leftmostWord(tree.children[1]!);
		if (prepositions.has(first.text.toLowerCase())) score -= 1;
	}
	if (tree.label === "main") {
		const rest = innerClause(tree.children[tree.head!]!);
		if (rest.type === "phrase" && vocativeClauses.has(rest.label)) {
			score += 2;
		}
	}
	tree.children.forEach((child, i) => {
		score += scoreTree(child, isModifier(tree, i));
	});
	return score;
}
