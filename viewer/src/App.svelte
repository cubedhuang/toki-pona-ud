<script lang="ts">
	import {
		AmbiguityError,
		formatCoNLLU,
		parse,
		tokenize,
		toUD,
		type Result,
		type Tree as TreeType,
	} from "ilo-nasin";

	import DepTree from "./DepTree.svelte";
	import Tree from "./Tree.svelte";

	const SHOWN = 5;

	type Outcome =
		| { kind: "empty" }
		| { kind: "parsed"; results: Result[] }
		| { kind: "incomplete" }
		| { kind: "ambiguous" }
		| { kind: "unexpected"; offset: number; word: string };

	let text = $state("sina ken ala toki pona e ijo la, sina sona ala e ijo.");
	let showAll = $state(false);

	// Parse tokens, as the pipeline does, so UD token ids line up.
	const tokens = $derived(tokenize(text));
	const offsets = $derived.by(() => {
		let cursor = 0;
		return tokens.map((token) => {
			const offset = text.indexOf(token, cursor);
			cursor = offset + token.length;
			return offset;
		});
	});

	const outcome: Outcome = $derived.by(() => {
		if (!text.trim()) return { kind: "empty" };
		try {
			const results = parse(tokens, text);
			return results.length
				? { kind: "parsed", results }
				: { kind: "incomplete" };
		} catch (e) {
			if (e instanceof AmbiguityError) return { kind: "ambiguous" };
			// nearley attaches the token it couldn't accept.
			const token = (
				e as { token?: { written: string; position: number } }
			).token;
			if (!token) throw e;
			return {
				kind: "unexpected",
				offset: offsets[token.position]!,
				word: token.written,
			};
		}
	});

	// Keep the last successful parse on screen while the input doesn't parse.
	type Parsed = { results: Result[]; tokens: string[]; text: string };
	let lastParsed: Parsed | undefined;
	const parsed: Parsed | undefined = $derived.by(() => {
		if (outcome.kind === "empty") lastParsed = undefined;
		else if (outcome.kind === "parsed")
			lastParsed = { results: outcome.results, tokens, text };
		return lastParsed;
	});
	const stale = $derived(outcome.kind !== "parsed");

	const results = $derived(parsed?.results ?? []);
	const shown = $derived(showAll ? results : results.slice(0, SHOWN));
	const depth = (tree: TreeType): number =>
		tree.type === "word" ? 2 : 1 + Math.max(...tree.children.map(depth));

	// Each box hangs 0.75rem below where it sits in the layout (top-3 -mt-3 in
	// Tree.svelte), which reaches past its parent's padding (0.25rem) and border
	// (2px). Relative positioning doesn't take up space, so reserve it here.
	const overhang = (tree: TreeType) => {
		const levels = depth(tree) - 1;
		return `calc(${0.75 + levels * 0.5}rem - ${levels * 2}px)`;
	};

	const formatScore = (p: number) => (p >= 0 ? `+${p}` : `${p}`);
</script>

<main class="my-20 px-8">
	<h1 class="text-3xl font-bold">ilo nasin</h1>

	<input
		class="mt-4 w-full rounded-xl border-2 border-gray-200 px-4 py-2 text-lg outline-none transition placeholder:text-gray-400 focus:border-gray-400"
		type="text"
		bind:value={text}
		placeholder="o toki pona..."
		spellcheck="false"
		aria-label="Sentence"
	/>

	<p class="mt-4 min-h-6">
		{#if outcome.kind === "parsed"}
			{outcome.results.length === 1
				? "1 parse found."
				: `${outcome.results.length} parses found.`}
		{:else if outcome.kind === "incomplete"}
			Unexpected end of input.
		{:else if outcome.kind === "ambiguous"}
			Too many possible parses.
		{:else if outcome.kind === "unexpected"}
			Can't parse “{outcome.word}” here:
			{text.slice(0, outcome.offset)}<mark
				class="bg-transparent text-red-600 underline decoration-wavy underline-offset-[0.2em]"
			>
				{outcome.word}
			</mark>{text.slice(outcome.offset + outcome.word.length)}
		{/if}
	</p>

	{#each shown as result, i (result)}
		{@const ud = toUD(result.tree, parsed!.tokens, parsed!.text)}
		<section class="mt-4 transition-opacity" class:opacity-40={stale}>
			{#if results.length > 1}
				<h2 class="text-xl font-bold">
					Parse {i + 1}
					<span class="text-xs font-normal text-gray-500">
						({formatScore(result.score)} score)
					</span>
				</h2>
			{/if}
			<div
				class="-mx-8 overflow-x-auto px-8"
				style:padding-bottom={overhang(result.tree)}
			>
				<Tree tree={result.tree} />
			</div>
			<div class="-mx-8 mt-6 overflow-x-auto px-8 pb-1">
				<DepTree tokens={ud} />
			</div>
			<details class="mt-2">
				<summary
					class="cursor-pointer text-sm font-semibold text-gray-500 select-none"
				>
					CoNLL-U
				</summary>
				<pre
					class="mt-2 overflow-x-auto tab-8 rounded-lg bg-gray-50 p-3 text-xs">{formatCoNLLU(
						ud,
						{ text: parsed!.text },
					).trimEnd()}</pre>
			</details>
		</section>
	{/each}

	{#if results.length > SHOWN}
		<button
			class="mt-4 cursor-pointer border-b-2 border-transparent font-semibold text-blue-500 outline-none transition hover:border-blue-500 focus-visible:border-blue-500"
			onclick={() => (showAll = !showAll)}
		>
			{showAll ? "Show less" : `Show ${results.length - SHOWN} more`}
		</button>
	{/if}
</main>
