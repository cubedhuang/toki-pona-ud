export const phraseLabels = [
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
	"negated_preverb",
	"verb_phrase_transitive",
	"verb_phrase_intransitive",
	"verb_phrase_prepositional",
	"object_phrase",
	"e",
	"& objects",
	"preposition_phrase",
	"negated_preposition",
	"& prepositions",
	"option",
	"& disjuncts",
	"phrase",
	"pi",
	"ordinal",
	"number",
	"emphasized",
] as const;

export type PhraseLabel = (typeof phraseLabels)[number];

export const wordRoles = [
	"content",
	"number",
	"emphasis",
	"negator", // ala
	"preverb",
	"preposition",
	"object_marker", // e
	"regrouper", // pi
	"ordinal_marker", // nanpa
	"context_marker", // la
	"subject_marker", // en
	"disjunct_marker", // anu
	"indicative_marker", // li
	"deontic_marker", // o
	"vocative_marker", // o
	"sentence_starter", // taso, kin, n, a
] as const;

export type WordRole = (typeof wordRoles)[number];

export interface Word {
	type: "word";
	role: WordRole;
	text: string;
	/** Index of the word's token in the input (see `Input`). */
	position: number;
	/** Character offset of the word in the input text, if the input was text. */
	offset?: number;
	/** Set for names: unofficial words, written with a capital. */
	name?: true;
	/**
	 * Set when the word stands for an "X ala X" question. Its `ala` and the
	 * repeated X are at the next two positions.
	 */
	question?: true;
	/** The other words of "X/Y/Z" alternatives, which this word, X, stands for. */
	alternatives?: { text: string; position: number }[];
}

export interface Phrase {
	type: "phrase";
	label: PhraseLabel;
	children: Tree[];
	/**
	 * Index of the head child, or `null` for a group whose children each
	 * depend on the enclosing phrase's head (e.g. several prepositional
	 * phrases after a verb).
	 */
	head: number | null;
}

export type Tree = Word | Phrase;
