export const labels = [
	// Phrases
	"main",
	"vocative",
	"clause",
	"context_phrase",
	"context_clause",
	"clause_marked_subject",
	"clause_unmarked_subject",
	"clause_optative",
	"clause_imperative",
	"subject",
	"& subjects",
	"predicate",
	"& predicates",
	"preverb_phrase",
	"verb_phrase_transitive",
	"verb_phrase_intransitive",
	"verb_phrase_prepositional",
	"object_phrase",
	"e",
	"& objects",
	"preposition_phrase",
	"& prepositions",
	"option",
	"& disjuncts",
	"phrase",
	"pi",
	"ordinal",
	"number",
	"head",
	"start",
	"pv",
	"prep",
	// Words
	"#",
	"emph",
	"obj",
	"regroup",
	"ord",
	"ctx",
	"conj",
	"neg",
	"or",
	"ind",
	"deo",
	"voc",
	"cont",
] as const;

export type Label = (typeof labels)[number];

export interface Word {
	/** Character offset of the word in the input text. */
	index: number;
	text: string;
}

export interface Leaf {
	type: "leaf";
	label: Label;
	word: Word;
	/** A trailing emphatic "a" attached to this word, as in "ala a". */
	emphasis?: Leaf;
}

export interface Node {
	type: "node";
	label: Label;
	children: Tree[];
}

export type Tree = Leaf | Node;
