import type { Lexer } from "nearley";

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
}

/**
 * What the parser reads: text, which is split into words, or tokens (such as
 * sonatoki's), of which only words are parsed. Skipped tokens, like
 * punctuation and numbers, still count toward `position`.
 */
export type Input = string | readonly string[];

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
export const prepositions = new Set(["tan", "lon", "sama", "tawa", "kepeken"]);
export const preverbs = new Set([
	"awen",
	"kama",
	"wile",
	"ken",
	"sona",
	"lukin",
	"alasa",
]);
export const numbers = new Set(["wan", "tu", "luka", "mute", "ale", "ali"]);
export const unmarkedSubjects = new Set(["mi", "sina"]);

const tokenTypeSet = new Set<string>(tokenTypes);

function classify(word: string): TokenType {
	if (particles.has(word)) return "word_particle";
	if (prepositions.has(word)) return "word_preposition";
	if (preverbs.has(word)) return "word_preverb";
	if (numbers.has(word)) return "word_number";
	if (word[0] !== word[0]!.toLowerCase()) return "word_modifier_only";
	if (unmarkedSubjects.has(word)) return "word_unmarked_subject";
	return "word_content";
}

// Latin letters, possibly joined by hyphens or apostrophes (toki-pona, Pije's).
const WORD = String.raw`\p{Script=Latin}+(?:['’-]\p{Script=Latin}+)*`;
const WORDS = new RegExp(WORD, "gu");
const IS_WORD = new RegExp(`^${WORD}$`, "u");

type Written = Pick<Token, "written" | "position" | "offset">;

function words(input: Input): Written[] {
	if (typeof input === "string") {
		return Array.from(input.matchAll(WORDS), (match, position) => ({
			written: match[0],
			position,
			offset: match.index,
		}));
	}
	return input.flatMap((written, position) =>
		IS_WORD.test(written) ? [{ written, position }] : [],
	);
}

/**
 * Capitals mark names, except on the first word of a sentence and in
 * sentences written in all caps, where they are only spelling.
 */
function lex(input: Input): Token[] {
	const written = words(input);
	const allCaps =
		written.length > 1 &&
		written.every((word) => word.written === word.written.toUpperCase());
	return written.map((word, i) => {
		const value =
			i === 0 || allCaps ? word.written.toLowerCase() : word.written;
		return { ...word, type: classify(value), value };
	});
}

export class TokiPonaLexer implements Lexer {
	private tokens: Token[] = [];
	private index = 0;

	// nearley passes along whatever is fed to the parser, so this can take tokens.
	reset(input: Input) {
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
