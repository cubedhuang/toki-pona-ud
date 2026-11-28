import type { Lexer } from "nearley";

import { lexicon, type WordClass } from "./wordClasses.js";

export const tokenTypes = [
	"word_particle",
	"word_content",
	"word_preposition",
	"word_preverb",
	"word_number",
	"word_modifier_only", // names
	"word_unmarked_subject", // mi, sina
] as const;

export type TokenType = (typeof tokenTypes)[number];

export interface Token {
	type: TokenType;
	/** The form the grammar matches, which is lowercased where capitals are only spelling. */
	value: string;
	/**
	 * The word as written. Not called `text`, which nearley would match
	 * literals against instead of `value`.
	 */
	written: string;
	/**
	 * Index of the token in the input: among the given tokens, or among the
	 * words of the text.
	 */
	position: number;
	/** Character offset of the token in the input text, if the input was text. */
	offset?: number;
	/**
	 * Set when the token stands for an "X ala X" question. Its `ala` and the
	 * repeated X are at the next two positions.
	 */
	question?: true;
	/**
	 * The other words of "X/Y/Z" alternatives, which this token, X, stands
	 * for. Slashes separate them.
	 */
	alternatives?: Pick<Token, "written" | "position">[];
}

/**
 * What the parser reads: text, which is split into words, or tokens (such as
 * sonatoki's), of which only words are parsed. Skipped tokens, like
 * punctuation and numbers, still count toward `position`.
 */
export type Input = string | readonly string[];

export interface TokensWithText {
	tokens: readonly string[];
	text: string;
}

// Marks a token left out of the parse, keeping its spelling so that offsets in
// the text can still be found.
const BLANK = "\0";

export function isBlank(token: string): boolean {
	return token.startsWith(BLANK);
}

function blank(token: string): string {
	return isBlank(token) ? token : BLANK + token;
}

/** Where each token starts in `text`, or -1 if it can't be found. */
function offsetsIn(tokens: readonly string[], text: string): number[] {
	let cursor = 0;
	return tokens.map((token) => {
		const form = isBlank(token) ? token.slice(1) : token;
		const offset = form ? text.indexOf(form, cursor) : -1;
		if (offset !== -1) cursor = offset + form.length;
		return offset;
	});
}

function withClass(wordClass: WordClass): Set<string> {
	return new Set(
		Object.keys(lexicon).filter((word) =>
			lexicon[word]!.includes(wordClass),
		),
	);
}

export const particles = new Set([
	"li",
	"e",
	"pi",
	"la",
	"en",
	"o",
	"anu",
	"a",
]);
export const prepositions = withClass("PREPOSITION");
export const preverbs = withClass("PRE-VERB");
export const numbers = new Set(["wan", "tu", "luka", "mute", "ale", "ali"]);
export const unmarkedSubjects = new Set(["mi", "sina"]);

const tokenTypeSet = new Set<string>(tokenTypes);

function classify(word: string): TokenType {
	if (particles.has(word)) return "word_particle";
	if (prepositions.has(word)) return "word_preposition";
	if (preverbs.has(word)) return "word_preverb";
	if (numbers.has(word) || IS_NUMBER.test(word)) return "word_number";
	if (word[0] !== word[0]!.toLowerCase()) return "word_modifier_only";
	if (unmarkedSubjects.has(word)) return "word_unmarked_subject";
	return "word_content";
}

// Latin letters, possibly joined by hyphens or apostrophes (toki-pona, Pije's).
const WORD = String.raw`\p{Script=Latin}+(?:['’-]\p{Script=Latin}+)*`;
// Digits, possibly with a decimal point or separators (7.7, 2,3,4).
const NUMBER = String.raw`\p{N}+(?:[.,]\p{N}+)*`;
const WORDS = new RegExp(`${WORD}|${NUMBER}`, "gu");
const IS_WORD = new RegExp(`^${WORD}$`, "u");
const IS_NUMBER = new RegExp(`^${NUMBER}$`, "u");

/**
 * Whether the parser reads this token: a word, or digits, which stand where a
 * number word could (e 1 e 2, nanpa 9, li 4509462252).
 */
export function isParsed(token: string): boolean {
	return IS_WORD.test(token) || IS_NUMBER.test(token);
}

type Written = Pick<Token, "written" | "position" | "offset">;

function words(input: Input | TokensWithText): Written[] {
	if (typeof input === "object" && "text" in input) {
		const offsets = offsetsIn(input.tokens, input.text);
		return words(input.tokens).map((word) =>
			offsets[word.position]! === -1
				? word
				: { ...word, offset: offsets[word.position]! },
		);
	}
	if (typeof input === "string") {
		return Array.from(input.matchAll(WORDS), (match, position) => ({
			written: match[0],
			position,
			offset: match.index,
		}));
	}
	return input.flatMap((written, position) =>
		isParsed(written) ? [{ written, position }] : [],
	);
}

/**
 * Capitals mark names, except on the first word of a sentence and in
 * sentences written in all caps, where they are only spelling.
 */
function lex(input: Input | TokensWithText): Token[] {
	const written = words(input);
	const allCaps =
		written.length > 1 &&
		written.every((word) => word.written === word.written.toUpperCase());
	return foldQuestions(
		foldAlternatives(
			written.map((word, i) => {
				const value =
					i === 0 || allCaps
						? word.written.toLowerCase()
						: word.written;
				return { ...word, type: classify(value), value };
			}),
			input,
		),
	);
}

/**
 * Folds "X/Y/Z" alternatives (wile/alasa/awen, Anku/Soson) into one token for
 * X, which behaves like X alone.
 *
 * Words only count as alternatives if a lone slash separates them and they are all names or all not.
 */
function foldAlternatives(
	tokens: Token[],
	input: Input | TokensWithText,
): Token[] {
	// Tokens alone don't tell whether the slash had spaces around it.
	if (typeof input === "object" && !("text" in input)) return tokens;

	const text = typeof input === "string" ? input : input.text;

	// What directly follows a word, up to the next word.
	const after = (a: Token, b: Token | undefined) =>
		a.offset === undefined
			? ""
			: text.slice(a.offset + a.written.length, b?.offset);

	const joinable = (a: Token, b: Token) =>
		![a, b].some(
			(t) => t.type === "word_particle" || IS_NUMBER.test(t.value),
		) &&
		(a.type === "word_modifier_only") ===
			(b.type === "word_modifier_only") &&
		after(a, b) === "/";

	const folded: Token[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const x = tokens[i]!;
		let j = i;
		while (j + 1 < tokens.length && joinable(tokens[j]!, tokens[j + 1]!)) {
			j++;
		}
		// Not slashes around a sound, as in kalama /ti/.
		if (j === i || after(tokens[j]!, tokens[j + 1]).startsWith("/")) {
			folded.push(x);
			continue;
		}
		const alternatives = tokens.slice(i + 1, j + 1);
		folded.push({
			...x,
			// Like mi ala mi, mi/sina is an ordinary subject that needs li.
			type: x.type === "word_unmarked_subject" ? "word_content" : x.type,
			alternatives: alternatives.map(({ written, position }) => ({
				written,
				position,
			})),
		});
		i = j;
	}
	return folded;
}

/**
 * Folds each "X ala X" question into one token for X.
 */
function foldQuestions(tokens: Token[]): Token[] {
	const folded: Token[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const [x, ala, repeat] = [tokens[i]!, tokens[i + 1], tokens[i + 2]];
		if (
			x.type !== "word_particle" &&
			x.value !== "ala" &&
			ala?.value === "ala" &&
			ala.position === x.position + 1 &&
			repeat?.value.toLowerCase() === x.value.toLowerCase() &&
			repeat.position === x.position + 2
		) {
			// "mi ala mi" and "sina ala sina" are ordinary subjects that need li.
			const type =
				x.type === "word_unmarked_subject" ? "word_content" : x.type;
			folded.push({ ...x, type, question: true });
			i += 2;
		} else {
			folded.push(x);
		}
	}
	return folded;
}

// Words, numbers, other letters (other scripts), then runs of anything else.
const TOKENS = new RegExp(
	`${WORD}|\\p{N}+(?:[.,]\\p{N}+)*|\\p{L}+|[^\\s\\p{L}\\p{N}]+`,
	"gu",
);

export function tokenize(text: string): string[] {
	return text.match(TOKENS) ?? [];
}

export function isWord(token: string): boolean {
	return IS_WORD.test(token);
}

const CLOSERS: Record<string, string> = { "(": ")", "[": "]" };

/**
 * The outermost bracketed spans of `tokens`, as the indices of their opening
 * and closing tokens. Only balanced pairs count, and only when words are left
 * outside them: a sentence wholly in brackets has no parenthetical.
 */
export function parentheticals(tokens: readonly string[]): [number, number][] {
	const spans: [number, number][] = [];
	const open: { closer: string; at: number }[] = [];
	tokens.forEach((token, i) => {
		if (isWord(token) || isBlank(token)) return;
		// A token can hold several marks, like ")." or ".)".
		for (const char of token) {
			if (char in CLOSERS) {
				open.push({ closer: CLOSERS[char]!, at: i });
			} else if (char === open.at(-1)?.closer) {
				const { at } = open.pop()!;
				if (open.length === 0 && at < i) spans.push([at, i]);
			}
		}
	});
	const inside = (i: number) => spans.some(([a, b]) => a < i && i < b);
	return tokens.some((token, i) => isWord(token) && !inside(i)) ? spans : [];
}

/**
 * The positions between `open` and `close`, split at slashes: alternatives
 * like (wile/alasa/awen) are analyzed one by one.
 */
export function segments(
	tokens: readonly string[],
	open: number,
	close: number,
): number[][] {
	const result: number[][] = [[]];
	for (let p = open + 1; p < close; p++) {
		if (/^\/+$/.test(tokens[p]!)) result.push([]);
		else result.at(-1)!.push(p);
	}
	return result;
}

/** The positions holding words, digits or other letters, not punctuation. */
export function contentOf(
	tokens: readonly string[],
	positions: number[],
): number[] {
	return positions.filter((p) => /^[\p{L}\p{N}]/u.test(tokens[p]!));
}

/**
 * Whether text starting at `content` is a name or foreign text in its own
 * spelling, like (Ganges) or (Alan Turing), rather than Toki Pona: it starts
 * with another script or a capitalized word that isn't Toki Pona.
 */
export function isForeign(
	tokens: readonly string[],
	content: number[],
): boolean {
	const first = tokens[content[0]!]!;
	return (
		!isParsed(first) ||
		(first !== first.toLowerCase() && !(first.toLowerCase() in lexicon))
	);
}

/** `tokens` with everything but `positions` blanked out. */
export function keepOnly(
	tokens: readonly string[],
	positions: number[],
): string[] {
	const keep = new Set(positions);
	return tokens.map((t, p) => (keep.has(p) ? t : blank(t)));
}

/**
 * `tokens` with the words of parentheticals blanked out, so that they are
 * skipped like punctuation but positions stay the same. Returns `tokens`
 * itself if there are none.
 */
export function maskParentheticals(
	tokens: readonly string[],
): readonly string[] {
	const spans = parentheticals(tokens);
	if (spans.length === 0) return tokens;
	return tokens.map((token, i) =>
		spans.some(([a, b]) => a < i && i < b) && isParsed(token)
			? blank(token)
			: token,
	);
}

export class TokiPonaLexer implements Lexer {
	private tokens: Token[] = [];
	private index = 0;

	// nearley passes along whatever is fed to the parser, so this can take tokens.
	reset(input: Input | TokensWithText) {
		this.tokens = lex(input);
		this.index = 0;
	}

	next(): Token | undefined {
		return this.tokens[this.index++];
	}

	save() {
		return {};
	}

	formatError(token: Token) {
		const where =
			token.offset === undefined
				? `token ${token.position}`
				: `index ${token.offset}`;
		return `'${token.written}' at ${where}`;
	}

	has(tokenType: string) {
		return tokenTypeSet.has(tokenType);
	}
}
