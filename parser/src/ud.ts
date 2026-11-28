// Converts a parse tree to Universal Dependencies.
//
// Tags and relations follow docs/draft-syntax.md.

import {
	contentOf,
	isBlank,
	isForeign,
	isWord,
	keepOnly,
	parentheticals,
	prepositions,
	segments,
} from "./lex.js";
import { parse } from "./parser.js";
import { lexicon } from "./wordClasses.js";
import { headWord, isModifier } from "./tree.js";
import type { Phrase, PhraseLabel, Tree, Word } from "./types.js";

export interface UDToken {
	/** 1-based, as in CoNLL-U. */
	id: number;
	form: string;
	lemma: string;
	upos: string;
	/** The parser's word role, or "_" for tokens the parser skipped. */
	xpos: string;
	feats: Record<string, string>;
	/** `id` of the head, or 0 for the root. */
	head: number;
	deprel: string;
	misc: Record<string, string>;
}

/** Where a content word sits, which decides its UPOS. */
type Slot = "nominal" | "transitive" | "intransitive" | "modifier";

interface Context {
	slot: Slot;
	/** Inside a clause with no subject, where `o` is imperative, not jussive. */
	imperative: boolean;
}

interface Info extends Context {
	head?: Word;
	/** "mod" until the modifier's UPOS is known. */
	deprel?: string;
	/** Part of an ordinal numeral (nanpa tu wan), which is ordinal as a whole. */
	ordinal?: boolean;
	/** The head of a sentence that is only a phrase, like "pona." */
	fragment?: boolean;
	/** An adjective before la (pona la), which is an adverb, "fortunately". */
	adverb?: boolean;
}

const PRONOUNS: Record<string, Record<string, string>> = {
	mi: { Person: "1", PronType: "Prs" },
	sina: { Person: "2", PronType: "Prs" },
	ona: { Person: "3", PronType: "Prs" },
	ni: { PronType: "Dem" },
	seme: { PronType: "Int" },
};

// The slot of a phrase's head, whatever surrounds the phrase. Noun phrases
// head the rest.
const HEAD_SLOTS: Partial<Record<PhraseLabel, Slot>> = {
	verb_phrase_transitive: "transitive",
	verb_phrase_intransitive: "intransitive",
	verb_phrase_prepositional: "nominal",
	subject: "nominal",
	e: "nominal",
	preposition_phrase: "nominal",
	vocative: "nominal",
	context_phrase: "nominal",
};

// Sentence starters other than these are discourse particles (n, a).
const STARTERS: Record<string, { deprel: string; upos: string }> = {
	taso: { deprel: "cc", upos: "CCONJ" },
	kin: { deprel: "advmod", upos: "ADV" },
};

/**
 * Converts the tree of a sentence parsed from `tokens` (see `parse`) to UD.
 * Tokens the parser skipped, like punctuation, are attached afterwards.
 * With the sentence's `text`, tokens followed directly by the next one get
 * `SpaceAfter=No`.
 */
export function toUD(
	tree: Tree,
	tokens: readonly string[],
	text?: string,
): UDToken[] {
	const info = new Map<Word, Info>();

	function walk(tree: Tree, context: Context): Word {
		if (tree.type === "word") {
			info.set(tree, { ...context });
			return tree;
		}
		if (tree.head === null) throw new Error(`'${tree.label}' has no head`);

		if (tree.label === "clause_imperative") {
			context = { ...context, imperative: true };
		}
		const headSlot = HEAD_SLOTS[tree.label];
		const head = walk(
			tree.children[tree.head]!,
			headSlot ? { ...context, slot: headSlot } : context,
		);
		// pona la: an adjective before la is an adverb, "fortunately".
		if (adjectivalContext(tree)) info.get(head)!.adverb = true;

		let firstObject: Word | undefined;
		tree.children.forEach((child, i) => {
			if (i === tree.head) return;
			const childContext = dependentContext(tree, i, context);
			// In mi pana e ni tawa sina e ijo tawa ona, each object has its own
			// preposition phrase: the later pairs are clauses with the verb
			// gapped, as in English "this to you and that to them".
			const gapped = gappedObjects(child);
			let cluster: Word | undefined;
			for (const member of members(child)) {
				const dependent = walk(member, childContext);
				let deprel = relation(tree, member, dependent);
				let to = head;
				// Repeated `e` coordinates the objects.
				if (deprel === "obj") {
					cluster = undefined;
					if (firstObject) {
						deprel = "conj";
						to = firstObject;
						if (gapped.has(member)) {
							to = head;
							cluster = dependent;
						}
					} else {
						firstObject = dependent;
					}
				} else if (deprel === "obl" && cluster) {
					// The object stands in for the missing verb.
					deprel = "orphan";
					to = cluster;
				}
				Object.assign(info.get(dependent)!, {
					head: to,
					deprel,
					// The number after nanpa.
					ordinal: tree.label === "ordinal",
				});
			}
		});
		return head;
	}

	const root = walk(tree, { slot: "nominal", imperative: false });
	// A sentence that is only a phrase (pona.), past any starters and la.
	let top = tree;
	while (top.type === "phrase" && top.label === "clause") {
		top = top.children[top.head!]!;
	}
	if (top.type === "phrase" && top.label === "subject") {
		info.get(root)!.fragment = true;
	}
	info.get(root)!.deprel = "root";

	// A modifier's UPOS depends on its head's, which can be a modifier too, as
	// in jan pi pona mute. Function words inside a modifier, like pi, keep
	// their own tags.
	const upos = new Map<Word, string>();
	function resolve(word: Word): string {
		const known = upos.get(word);
		if (known) return known;
		const i = info.get(word)!;
		let tag: string;
		if (
			i.slot === "modifier" &&
			(word.role === "content" || word.role === "emphasis")
		) {
			tag = modifierUpos(word, resolve(i.head!));
			if (i.deprel === "mod") i.deprel = modifierRelation(tag);
		} else {
			tag = uposOf(word, i);
		}
		upos.set(word, tag);
		return tag;
	}
	for (const word of info.keys()) resolve(word);

	// Emphasis on a function word (lon a) goes to the word it marks, since
	// function words have no dependents in UD.
	for (const i of info.values()) {
		const head = i.head && info.get(i.head);
		if (
			i.deprel === "discourse" &&
			head?.head &&
			FUNCTION.has(head.deprel!)
		) {
			i.head = head.head;
		}
	}

	// Emphasis ending the sentence (sina ken kama a) is on the whole of it.
	const last = Math.max(...[...info.keys()].map((w) => w.position));
	for (const [word, i] of info) {
		if (
			word.role === "emphasis" &&
			word.position === last &&
			word !== root
		) {
			i.head = root;
		}
	}

	// A determiner can't head a pi group (pi ale), since determiners have no
	// dependents: there it is the noun "everything", or a pronoun (pi ni).
	for (const [word, i] of info) {
		if (word.role !== "regrouper" || upos.get(i.head!) !== "DET") continue;
		const head = i.head!;
		const text = head.text.toLowerCase();
		upos.set(head, text === "ale" || text === "ali" ? "NOUN" : "PRON");
		const headInfo = info.get(head)!;
		if (headInfo.deprel === "det") headInfo.deprel = "nmod";
	}

	// Consecutive number words modifying a noun form one additive numeral (tu
	// wan "three"): the first is nummod and the rest are compound on it, as
	// in UD Czech (dvacet dva).
	const modifiers = Map.groupBy(
		[...info]
			.filter(
				([w, i]) =>
					i.slot === "modifier" && w.role === "content" && i.head,
			)
			.sort(([a], [b]) => a.position - b.position),
		([, i]) => i.head!,
	);
	for (const [head, entries] of modifiers) {
		const words = entries.map(([w]) => w);
		// A name of several words (jan Ke Tami) is held together by flat on
		// its first word, which is compound on the head.
		for (const run of adjacentRuns(words, (w) => !!w.name)) {
			for (const word of run.slice(1)) {
				Object.assign(info.get(word)!, {
					head: run[0],
					deprel: "flat",
				});
			}
		}
		if (!["NOUN", "PROPN", "PRON"].includes(upos.get(head)!)) continue;
		for (const run of adjacentRuns(words, isNumber).filter(isNumeral)) {
			run.forEach((word, k) => {
				upos.set(word, "NUM");
				Object.assign(
					info.get(word)!,
					k === 0
						? { deprel: "nummod" }
						: { head: run[0], deprel: "compound" },
				);
			});
		}
	}

	const byPosition = new Map([...info.keys()].map((w) => [w.position, w]));
	const id = (word: Word) => word.position + 1;
	const rootId = id(root);

	// The rest of an ordinal numeral (nanpa tu wan) is ordinal too.
	for (const i of info.values()) {
		if (i.deprel === "compound" && i.head && info.get(i.head)!.ordinal) {
			i.ordinal = true;
		}
	}

	// "X/Y/Z": the other alternatives are coordinated with X, as with anu.
	const alternativeOf = new Map<number, Word>();
	for (const word of info.keys()) {
		for (const a of word.alternatives ?? []) {
			alternativeOf.set(a.position, word);
		}
	}

	// `word`'s tags and features, which `like` gives if they're another's.
	const wordToken = (
		form: string,
		position: number,
		word: Word,
		head: number,
		deprel: string,
		like = word,
	): UDToken => {
		const tag = upos.get(like)!;
		return {
			id: position + 1,
			form,
			lemma: lemmaOf(word, form),
			upos: tag,
			xpos: "_",
			feats: featsOf(word, tag, info.get(like)!),
			head,
			deprel,
			misc: {},
		};
	};

	const result = tokens.map((form, position): UDToken => {
		const first = alternativeOf.get(position);
		if (first) {
			// Tagged like X, but with features of its own (mi/sina).
			const self: Word = { ...first, text: form, position };
			return wordToken(form, position, self, id(first), "conj", first);
		}

		const word = byPosition.get(position);
		if (word) {
			const i = info.get(word)!;
			return wordToken(
				form,
				position,
				word,
				i.head ? id(i.head) : 0,
				i.deprel!,
			);
		}

		// "X ala X": ala negates the repeated X, which is coordinated with X.
		const question = [1, 2]
			.map((back) => byPosition.get(position - back))
			.find((w) => w?.question);
		if (question?.position === position - 2) {
			return wordToken(form, position, question, id(question), "conj");
		}
		if (question) {
			return {
				id: position + 1,
				form,
				lemma: "ala",
				upos: "ADV",
				xpos: "_",
				feats: { Polarity: "Neg" },
				head: position + 2,
				deprel: "advmod",
				misc: {},
			};
		}

		return skipped(form, position, byPosition, rootId);
	});

	for (const [open, close] of parentheticals(tokens)) {
		// Unless the sentence only parsed with the parenthetical in it.
		if (![...byPosition.keys()].some((p) => open < p && p < close)) {
			attachParenthetical(result, tokens, open, close, text);
		}
	}

	attachPunctuation(result);
	if (text !== undefined) markSpaces(result, text);
	return result;
}

/**
 * Analyzes the parenthetical between `open` and `close`, which the sentence
 * was parsed without, and attaches it: a clause as parataxis on the root,
 * anything else as appos on the noun phrase before it. Alternatives split by
 * slashes (wile/alasa/awen) are coordinated.
 */
function attachParenthetical(
	result: UDToken[],
	tokens: readonly string[],
	open: number,
	close: number,
	text?: string,
) {
	// Before the parenthetical's own root is copied in.
	const root = result.findIndex((t) => t.head === 0);
	const heads = segments(tokens, open, close).flatMap((segment) => {
		const head = analyzeSegment(result, tokens, segment, text);
		return head === undefined ? [] : [head];
	});
	if (heads.length === 0) return;
	const [first, ...rest] = heads as [number, ...number[]];
	for (const p of rest) {
		Object.assign(result[p]!, { head: first + 1, deprel: "conj" });
	}

	const marker = result.find(
		(t) => t.head === first + 1 && t.deprel === "case",
	)?.lemma;
	let attachment: Pick<UDToken, "head" | "deprel">;
	if (isClause(result, first)) {
		attachment = { head: root + 1, deprel: "parataxis" };
	} else if (marker === "o") {
		// (ilo Tani o)
		attachment = { head: root + 1, deprel: "vocative" };
	} else if (marker !== undefined && prepositions.has(marker)) {
		// (lon tenpo pini) is an adjunct of the predicate, or of a noun that
		// stands alone.
		const nominal = NOMINAL.includes(result[root]!.upos);
		attachment = { head: root + 1, deprel: nominal ? "nmod" : "obl" };
	} else {
		const anchor = nounPhraseBefore(result, open);
		attachment =
			anchor === undefined
				? { head: root + 1, deprel: "parataxis" }
				: { head: anchor + 1, deprel: "appos" };
	}
	Object.assign(result[first]!, attachment);
}

const FUNCTION = new Set(["case", "mark", "aux", "cc"]);

const NOMINAL = ["NOUN", "PROPN", "PRON", "NUM", "X"];

/** Whether the word at `head` heads a clause, with a subject or li or o. */
function isClause(result: UDToken[], head: number): boolean {
	return result.some(
		(t) =>
			t.head === head + 1 && ["nsubj", "aux", "advcl"].includes(t.deprel),
	);
}

/**
 * Analyzes the tokens at `positions` in place and returns the position of
 * their head, or undefined if they hold no words (like "(1886)"). Toki Pona
 * is parsed; foreign text, or text that doesn't parse, is headed by its first
 * word.
 */
function analyzeSegment(
	result: UDToken[],
	tokens: readonly string[],
	positions: number[],
	text?: string,
): number | undefined {
	const content = contentOf(tokens, positions);
	if (content.length === 0) return undefined;
	const foreign = isForeign(tokens, content);

	if (!foreign) {
		const whole = analyzeAlone(tokens, positions, text);
		// A sentence can't be a bare preposition phrase, so (lon tenpo pini)
		// would parse as a noun phrase headed by lon.
		const [preposition, ...rest] = content;
		if (
			(!whole || !isClause(whole.tokens, whole.root)) &&
			prepositions.has(tokens[preposition!]!.toLowerCase()) &&
			rest.length > 0
		) {
			const object = analyzeAlone(
				tokens,
				positions.filter((p) => p > preposition!),
				text,
			);
			if (object) {
				copy(result, object.tokens, positions);
				const form = tokens[preposition!]!;
				Object.assign(result[preposition!]!, {
					lemma: form.toLowerCase(),
					upos: "ADP",
					feats: {},
					head: object.root + 1,
					deprel: "case",
				});
				return object.root;
			}
		}
		if (whole) {
			copy(result, whole.tokens, positions);
			return whole.root;
		}
	}

	const head = content[0]!;
	const capital = (form: string) =>
		isWord(form) && form !== form.toLowerCase();
	// A foreign name (Alan Turing) is PROPN held together by flat like other
	// names; other foreign text is X held together by flat:foreign.
	const name = foreign && content.every((p) => capital(tokens[p]!));
	for (const p of content) {
		const form = tokens[p]!;
		const upos = foreign
			? name
				? "PROPN"
				: "X"
			: capital(form) && p !== head
				? "PROPN"
				: lexicalUpos(form.toLowerCase());
		Object.assign(result[p]!, {
			lemma: upos === "PROPN" || foreign ? form : form.toLowerCase(),
			upos,
			feats: foreign ? { Foreign: "Yes" } : {},
			head: head + 1,
			deprel: !foreign ? "dep" : name ? "flat" : "flat:foreign",
		});
	}
	return head;
}

/** Parses and converts the tokens at `positions` as a sentence of their own. */
function analyzeAlone(
	tokens: readonly string[],
	positions: number[],
	text?: string,
): { tokens: UDToken[]; root: number } | undefined {
	const only = keepOnly(tokens, positions);
	try {
		const [best] = parse(only, text);
		if (!best) return undefined;
		const sub = toUD(best.tree, only);
		return { tokens: sub, root: sub.findIndex((t) => t.head === 0) };
	} catch {
		return undefined;
	}
}

function copy(result: UDToken[], from: UDToken[], positions: number[]) {
	for (const p of positions) {
		// Blanked tokens before a part, like the preposition, aren't copied.
		if (!isBlank(from[p]!.form)) result[p] = from[p]!;
	}
}

/**
 * The head of the noun phrase ending just before `position`, if a noun
 * phrase ends there: the word before, raised past the modifiers it is part
 * of, but not out of a pi phrase.
 */
function nounPhraseBefore(
	result: UDToken[],
	position: number,
): number | undefined {
	let i = position - 1;
	// Past punctuation and markers like la: open la (2001).
	const marker = ["PUNCT", "ADP", "SCONJ", "CCONJ", "PART", "AUX"];
	while (i >= 0 && marker.includes(result[i]!.upos)) i--;
	if (i < 0) return undefined;
	const word = ["amod", "compound", "flat", "det", "nummod", "advmod"];
	// The highest nominal on the way: in li musi Soki (Shogi), the predicate
	// musi is ADJ, so the name is.
	let nominal: number | undefined;
	for (;;) {
		const t = result[i]!;
		if (NOMINAL.includes(t.upos)) nominal = i;
		const pi = result.some((c) => c.head === i + 1 && c.deprel === "mark");
		if (t.head === 0) break;
		if (!word.includes(t.deprel) && !(t.deprel === "nmod" && !pi)) break;
		i = t.head - 1;
	}
	return nominal;
}

/** A word's UPOS from its first sense in the lexicon, out of context. */
function lexicalUpos(word: string): string {
	if (/^\p{N}/u.test(word)) return "NUM";
	const tags: Record<string, string> = {
		NOUN: "NOUN",
		ADJECTIVE: "ADJ",
		VERB: "VERB",
		"PRE-VERB": "VERB",
		PREPOSITION: "ADP",
		NUMBER: "NUM",
		PRONOUN: "PRON",
		INTERJECTION: "INTJ",
		PARTICLE: "PART",
	};
	return tags[lexicon[word]?.[0] ?? ""] ?? "X";
}

function lemmaOf(word: Word, form: string): string {
	return word.name ? form : form.toLowerCase();
}

const NUMBER_VALUES: Record<string, number> = {
	wan: 1,
	tu: 2,
	luka: 5,
	mute: 20,
	ale: 100,
	ali: 100,
};

const isNumber = (word: Word) => word.text.toLowerCase() in NUMBER_VALUES;

/**
 * Whether number words form one numeral: at least two words, never
 * increasing in value, with at least one of wan, tu or luka, so that "mute
 * mute" stays "very many".
 */
function isNumeral(run: Word[]): boolean {
	const values = run.map((w) => NUMBER_VALUES[w.text.toLowerCase()]!);
	return (
		run.length > 1 &&
		values.every((v, k) => k === 0 || v <= values[k - 1]!) &&
		values.some((v) => v <= 5)
	);
}

/**
 * Runs of more than one word at adjacent positions among `words`, which are
 * in order, that all satisfy `test`.
 */
function adjacentRuns(words: Word[], test: (word: Word) => boolean): Word[][] {
	const runs: Word[][] = [];
	let previous: Word | undefined;
	for (const word of words) {
		if (!test(word)) {
			previous = undefined;
			continue;
		}
		if (previous?.position === word.position - 1) runs.at(-1)!.push(word);
		else runs.push([word]);
		previous = word;
	}
	return runs.filter((run) => run.length > 1);
}

/**
 * The `e` phrases, among objects joined by repeated `e`, that start a clause
 * with the verb gapped: those with their own preposition phrase, when an
 * object before the last has one too. A preposition phrase only on the last
 * object is shared by all of them (mi pana e kili e telo tawa sina).
 */
function gappedObjects(tree: Tree): Set<Tree> {
	const gapped = new Set<Tree>();
	if (tree.type !== "phrase" || tree.label !== "& objects") return gapped;
	const own = (object: Tree) =>
		object.type === "phrase" &&
		object.children.some(
			(c) =>
				c.type === "phrase" &&
				(c.label === "preposition_phrase" ||
					c.label === "& prepositions"),
		);
	if (!tree.children.slice(0, -1).some(own)) return gapped;
	for (const object of tree.children.slice(1)) {
		if (object.type === "phrase" && own(object)) {
			gapped.add(
				object.children.find(
					(c) => c.type === "phrase" && c.label === "e",
				)!,
			);
		}
	}
	return gapped;
}

/** Children of a headless group each depend on the enclosing phrase's head. */
function members(tree: Tree): Tree[] {
	return tree.type === "phrase" && tree.head === null
		? tree.children.flatMap(members)
		: [tree];
}

/**
 * The context of child `index` of `parent`. A `pi` phrase's head is tagged
 * like a bare modifier would be.
 */
function dependentContext(
	parent: Phrase,
	index: number,
	context: Context,
): Context {
	if (isModifier(parent, index)) return { ...context, slot: "modifier" };
	// A clause's dependents are its subjects, which can be bare words (sina o ...).
	if (parent.label.startsWith("clause_"))
		return { ...context, slot: "nominal" };
	return context;
}

function relation(parent: Phrase, child: Tree, dependent: Word): string {
	const kind = child.type === "word" ? child.role : child.label;
	switch (dependent.role) {
		case "indicative_marker":
		case "deontic_marker":
			return "aux";
		case "object_marker":
		case "vocative_marker":
		case "preposition":
			return "case";
		case "regrouper":
			return "mark";
		case "context_marker":
			return parent.label === "context_clause" ? "mark" : "case";
		case "subject_marker":
		case "disjunct_marker":
			return "cc";
		case "negator":
			return "advmod";
		case "emphasis":
			return "discourse";
		case "sentence_starter":
			return (
				STARTERS[dependent.text.toLowerCase()]?.deprel ?? "discourse"
			);
	}
	if (parent.label.startsWith("clause_")) return "nsubj";
	switch (kind) {
		case "subject":
			return parent.label === "& subjects" ? "conj" : "nsubj";
		case "predicate":
		case "option":
			return "conj";
		case "e":
			return "obj";
		case "preposition_phrase":
			return "obl";
		case "context_phrase":
			return "obl";
		case "context_clause":
			return "advcl";
		case "vocative":
			return "vocative";
		case "pi":
			return "mod";
		case "ordinal":
			return "nmod"; // nanpa heads it, like Vietnamese thứ
	}
	if (parent.label === "ordinal") return "nummod";
	if (parent.label === "preverb_phrase") return "xcomp";
	if (parent.label === "number") return "compound";
	if (parent.label === "phrase") return "mod";
	return "dep";
}

/** UPOS of a word that isn't a modifier. */
function uposOf(word: Word, info: Info): string {
	const text = word.text.toLowerCase();
	switch (word.role) {
		case "content":
			break;
		case "number":
			return "NUM";
		case "emphasis":
			return "INTJ";
		case "negator":
			return "ADV";
		case "preverb":
			return "VERB";
		case "preposition":
		case "object_marker":
		case "vocative_marker":
			return "ADP";
		case "ordinal_marker":
			return "NOUN";
		case "regrouper":
			return "PART";
		case "context_marker":
			return info.deprel === "mark" ? "SCONJ" : "ADP";
		case "subject_marker":
		case "disjunct_marker":
			return "CCONJ";
		case "indicative_marker":
		case "deontic_marker":
			return "AUX";
		case "sentence_starter":
			return STARTERS[text]?.upos ?? "INTJ";
	}
	if (word.name) return "PROPN";
	if (/^\p{N}/u.test(text)) return "NUM";
	if (info.adverb) return "ADV";
	if (text in PRONOUNS) return "PRON";
	if (info.slot === "transitive") return "VERB";
	if (info.slot === "intransitive") {
		// The intransitive predicate keeps its lexical class: its first verb or
		// adjective sense, otherwise a noun or number.
		const classes = lexicon[text] ?? [];
		for (const c of classes) {
			if (c === "VERB" || c === "PRE-VERB") return "VERB";
			if (c === "ADJECTIVE") return "ADJ";
		}
		if (classes.includes("NOUN")) return "NOUN";
		if (classes.includes("NUMBER")) return "NUM";
		return "VERB";
	}
	// Alone, a word is tagged by its first sense: pona. is ADJ, jan. NOUN.
	if (info.fragment && lexicon[text]?.[0] === "ADJECTIVE") return "ADJ";
	return "NOUN";
}

/**
 * Whether `tree` is a phrase before la headed by an adjective (pona la, suli
 * mute la). Its head is an adverb, "fortunately", which is obl like other
 * phrases before la, as English "by now" is.
 */
function adjectivalContext(tree: Tree): boolean {
	if (tree.type !== "phrase" || tree.label !== "context_phrase") return false;
	// Not the object of a preposition (tan ni la).
	const phrase = tree.children[tree.head!]!;
	if (phrase.type === "phrase" && phrase.label === "preposition_phrase") {
		return false;
	}
	const head = headWord(tree);
	const text = head.text.toLowerCase();
	return (
		!head.name && !(text in PRONOUNS) && lexicon[text]?.[0] === "ADJECTIVE"
	);
}

/** UPOS of a content word or emphasis modifying a head tagged `headUpos`. */
function modifierUpos(word: Word, headUpos: string): string {
	const text = word.text.toLowerCase();
	if (word.role === "emphasis") return "INTJ";
	if (word.name) return "PROPN";
	if (/^\p{N}/u.test(text)) return "NUM";
	if (text === "ala") return "ADV";
	if (["VERB", "ADJ", "ADV"].includes(headUpos)) return "ADV";
	if (text === "ni" || text === "seme") return "DET";
	if (text in PRONOUNS) return "PRON";
	// Like English one and two, and all.
	if (text === "wan" || text === "tu") return "NUM";
	if (text === "ale" || text === "ali") return "DET";
	// Modifiers are adjectives when the word can be one, otherwise its first
	// noun or number sense.
	const classes = lexicon[text] ?? [];
	if (classes.includes("ADJECTIVE")) return "ADJ";
	for (const c of classes) {
		if (c === "NOUN") return "NOUN";
		if (c === "NUMBER") return "NUM";
	}
	return "ADJ";
}

function modifierRelation(upos: string): string {
	switch (upos) {
		case "ADJ":
			return "amod";
		case "NOUN":
		case "PRON": // possessors like tomo mi, as in Haitian Creole and Indonesian
			return "nmod";
		case "NUM":
			return "nummod";
		case "ADV":
			return "advmod";
		case "DET":
			return "det";
		case "PROPN":
			// A name can't stand without the word it modifies (ilo Siko, mi
			// toki Inli), like Vietnamese thành phố Lạng Sơn "city Lạng Sơn".
			return "compound";
		case "INTJ":
			return "discourse";
	}
	return "dep";
}

function featsOf(word: Word, upos: string, info: Info): Record<string, string> {
	const text = word.text.toLowerCase();
	if (word.role === "indicative_marker") return { Mood: "Ind" };
	if (word.role === "deontic_marker") {
		return { Mood: info.imperative ? "Imp" : "Opt" };
	}
	if (text === "ala") return { Polarity: "Neg" };
	if ((text === "ale" || text === "ali") && upos === "DET") {
		return { PronType: "Tot" };
	}
	if (upos === "PRON" || upos === "DET") return { ...PRONOUNS[text] };
	if (upos === "NUM") {
		return { NumType: info.ordinal ? "Ord" : "Card" };
	}
	return {};
}

/** A token the parser skipped: punctuation, a number, or a foreign word. */
function skipped(
	form: string,
	position: number,
	words: Map<number, Word>,
	rootId: number,
): UDToken {
	const token = {
		id: position + 1,
		form,
		lemma: form,
		xpos: "_",
		head: rootId,
		misc: {},
	};
	if (/^\p{N}/u.test(form)) {
		// Attach to the word before, as in "kili 25".
		const before = Math.max(
			...[...words.keys()].filter((p) => p < position),
		);
		return {
			...token,
			upos: "NUM",
			feats: { NumType: "Card" },
			...(before === -Infinity
				? { deprel: "dep" }
				: { head: before + 1, deprel: "nummod" }),
		};
	}
	if (/^[^\p{L}\p{N}]+$/u.test(form)) {
		return { ...token, upos: "PUNCT", feats: {}, deprel: "punct" };
	}
	if (form.startsWith("@")) {
		return { ...token, upos: "PROPN", feats: {}, deprel: "dep" };
	}
	return { ...token, upos: "X", feats: { Foreign: "Yes" }, deprel: "dep" };
}

const PAIRS: Record<string, string> = {
	"(": ")",
	"[": "]",
	"{": "}",
	"“": "”",
	"«": "»",
	"‹": "›",
	"「": "」",
	"『": "』",
	'"': '"',
};

/**
 * Attaches punctuation as UD's guidelines describe, like Udapi's ud.FixPunct
 * but simpler: brackets and quotes to the head of what they enclose, other
 * punctuation to the conjunct right after it, or the phrase it ends, or else
 * the lowest word that dominates both its neighbors. Never so that arcs cross.
 */
function attachPunctuation(tokens: UDToken[]) {
	const n = tokens.length;
	const isPunct = (i: number) => tokens[i]!.upos === "PUNCT";
	const parent = (i: number) => tokens[i]!.head - 1;
	const root = tokens.findIndex((t) => t.head === 0);
	if (root === -1) return;

	const ancestors = (i: number) => {
		const chain = [i];
		while (parent(chain.at(-1)!) >= 0) chain.push(parent(chain.at(-1)!));
		return chain;
	};
	const leftmost = (x: number) => {
		for (let i = 0; i < n; i++) {
			if (!isPunct(i) && ancestors(i).includes(x)) return i;
		}
		return x;
	};
	const rightmost = (x: number) => {
		for (let i = n - 1; i >= 0; i--) {
			if (!isPunct(i) && ancestors(i).includes(x)) return i;
		}
		return x;
	};
	// Punctuation not placed yet still points at the root, so it's ignored.
	const done = new Set<number>();
	const crosses = (head: number, p: number) => {
		const lo = Math.min(head, p);
		const hi = Math.max(head, p);
		return tokens.some((t, j) => {
			if (j === p || t.head === 0 || (isPunct(j) && !done.has(j))) {
				return false;
			}
			const a = Math.min(j, parent(j));
			const b = Math.max(j, parent(j));
			return (a < lo && lo < b && b < hi) || (lo < a && a < hi && hi < b);
		});
	};
	const neighbor = (p: number, step: 1 | -1) => {
		let i = p + step;
		while (i >= 0 && i < n && isPunct(i)) i += step;
		return i >= 0 && i < n ? i : undefined;
	};
	// The preferred head or the nearest of its ancestors that doesn't cross
	// an arc, otherwise the words next to the mark and their ancestors.
	const attach = (p: number, head: number) => {
		const candidates = [head, neighbor(p, -1), neighbor(p, 1)]
			.filter((i) => i !== undefined)
			.flatMap(ancestors);
		const chosen = candidates.find((c) => !crosses(c, p)) ?? head;
		tokens[p]!.head = chosen + 1;
		done.add(p);
	};

	// Paired punctuation: both marks go to the one enclosed word whose head
	// is outside them.
	for (let open = 0; open < n; open++) {
		const closer = PAIRS[tokens[open]!.form[0]!];
		if (!closer || done.has(open)) continue;
		const close = tokens.findIndex(
			(t, j) => j > open && !done.has(j) && t.form.includes(closer),
		);
		if (close === -1) continue;
		const tops = [];
		for (let i = open + 1; i < close; i++) {
			if (isPunct(i)) continue;
			const h = parent(i);
			if (h < open || h > close) tops.push(i);
		}
		if (tops.length !== 1) continue;
		attach(open, tops[0]!);
		attach(close, tops[0]!);
	}

	for (let p = 0; p < n; p++) {
		if (!isPunct(p) || done.has(p)) continue;
		const left = neighbor(p, -1);
		const right = neighbor(p, 1);
		if (left === undefined || right === undefined) {
			attach(p, root);
			continue;
		}
		const above = ancestors(left);
		const path = ancestors(right);
		const common = path.find((i) => above.includes(i))!;
		// Before a conjunct, punctuation goes to that conjunct.
		const conjunct = path
			.slice(0, path.indexOf(common))
			.findLast(
				(i) => tokens[i]!.deprel === "conj" && leftmost(i) === right,
			);
		// After a phrase, such as a la phrase or a vocative, punctuation goes
		// to that phrase, as UD English does after fronted adverbials.
		const ended = above
			.slice(0, above.indexOf(common))
			.findLast((i) => rightmost(i) === left);
		attach(p, conjunct ?? ended ?? common);
	}
}

function markSpaces(tokens: UDToken[], text: string) {
	let cursor = 0;
	for (const token of tokens) {
		const start = text.indexOf(token.form, cursor);
		if (start === -1) continue;
		cursor = start + token.form.length;
		if (cursor < text.length && !/\s/.test(text[cursor]!)) {
			token.misc.SpaceAfter = "No";
		}
	}
}

function field(values: Record<string, string>): string {
	const keys = Object.keys(values).sort((a, b) =>
		a.toLowerCase().localeCompare(b.toLowerCase()),
	);
	return keys.length ? keys.map((k) => `${k}=${values[k]}`).join("|") : "_";
}

/** Formats one sentence as CoNLL-U, with `comments` such as `text`. */
export function formatCoNLLU(
	tokens: readonly UDToken[],
	comments: Record<string, string> = {},
): string {
	const lines = Object.entries(comments).map(([k, v]) => `# ${k} = ${v}`);
	for (const t of tokens) {
		lines.push(
			[
				t.id,
				t.form,
				t.lemma,
				t.upos,
				t.xpos,
				field(t.feats),
				t.head,
				t.deprel,
				"_",
				field(t.misc),
			].join("\t"),
		);
	}
	return lines.join("\n") + "\n\n";
}
