// Adapted from https://github.com/toaq/kuna/blob/a18c585a791ae2dac47fa9e5deba3a7ef4725567/src/scripts/grammar-preprocessor.ts

/**
 * This tool processes a nearley.js grammar with "generics", such as
 *
 *      Foo<T> -> Bar<T> Hao<T>
 *      Example -> Foo<x>
 *      Mua -> Foo<y>
 *
 * and expands all the generic templates:
 *
 *      Foo_x -> Bar_x Hao_x
 *      Foo_y -> Bar_y Hao_y
 *      Example -> Foo_x
 *      Mua -> Foo_y
 *
 * Foo<A> (uppercase) is treated as a generic rule with a variable "A", and
 * Foo<b> (lowercase) is treated as an instantiation thereof with A = b.
 *
 * It's not very fancy, and uses regex to get the job done. It expects rules to
 * be contained in one line and only refer to at most one generic variable.
 *
 * Usage: esr scripts/expand-generics.ts input.ne output.ne
 */

import * as fs from "node:fs";

export function expandGenerics(lines: string[]): string[] {
	const expanded: string[][] = [];

	/** Generic rule name -> the output slots and source lines defining it. */
	const generics = new Map<string, { slot: number; line: string }[]>();

	/** Every instance in order of appearance, e.g. Foo<x> is ["Foo", "x"]. */
	const instances: [name: string, value: string][] = [];

	/** Generic rules that pass their variable to each other, e.g. Foo<T> -> Bar<T>. */
	const links = new Map<string, Set<string>>();

	function link(x: string, y: string) {
		links.set(x, (links.get(x) ?? new Set()).add(y));
	}

	for (let line of lines) {
		line = line.replace(/(\w+)<([a-z]\w*)>/g, (_, name, value) => {
			instances.push([name, value]);
			return `${name}_${value}`;
		});

		const m = line.trim().match(/^(\w+)<([A-Z]\w*)>/);
		if (!m) {
			expanded.push([line]);
			continue;
		}

		// A generic definition: filled in once all values are known.
		const [, name, variable] = m as [string, string, string];
		const defs = generics.get(name) ?? [];
		defs.push({ slot: expanded.length, line });
		generics.set(name, defs);
		expanded.push([]);

		const body = line.split("->")[1] ?? "";
		for (const symbol of body.split(/\s+/)) {
			if (symbol.endsWith(`<${variable}>`)) {
				const dep = symbol.split("<")[0]!;
				link(name, dep);
				link(dep, name);
			}
		}
	}

	/**
	 * Every value used by an instance of `name` or of a rule linked to it, in
	 * order of first appearance.
	 */
	function valuesOf(name: string): string[] {
		const group = new Set([name]);
		const stack = [name];
		while (stack.length) {
			for (const next of links.get(stack.pop()!) ?? []) {
				if (!group.has(next)) {
					group.add(next);
					stack.push(next);
				}
			}
		}
		const values = instances
			.filter(([n]) => group.has(n))
			.map(([, v]) => v);
		return [...new Set(values)];
	}

	for (const [name, defs] of generics) {
		for (const value of valuesOf(name)) {
			for (const { slot, line } of defs) {
				expanded[slot]!.push(line.replace(/<[A-Z]\w*>/g, `_${value}`));
			}
		}
	}

	return expanded.flat();
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
	console.error("Usage: esr scripts/expand-generics.ts input.ne output.ne");
	process.exit(1);
}
const lines = fs.readFileSync(inputPath, "utf-8").trim().split("\n");
fs.writeFileSync(outputPath, `${expandGenerics(lines).join("\n")}\n`);
