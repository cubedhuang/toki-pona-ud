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
	value: string;
	/** Index of the token among the sentence's tokens, from 0. */
	position: number;
	/** Character offset of the token in the input text. */
	offset: number;
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

/** Splits text into runs of ASCII letters; everything else is skipped. */
export class TokiPonaLexer implements Lexer {
	private words: IterableIterator<RegExpMatchArray> = [].values();
	private position = 0;

	reset(text: string) {
		this.words = text.matchAll(/[a-z]+/gi);
		this.position = 0;
	}

	next(): Token | undefined {
		const match = this.words.next().value;
		if (!match) return undefined;
		const value = match[0];
		return {
			type: classify(value),
			value,
			position: this.position++,
			offset: match.index!,
		};
	}

	save() {
		return {};
	}

	formatError(token: Token) {
		return `'${token.value}' at index ${token.offset}`;
	}

	has(tokenType: string) {
		return tokenTypeSet.has(tokenType);
	}
}
