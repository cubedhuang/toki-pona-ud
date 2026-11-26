<script lang="ts">
	import { parse, type Result, type Tree as TreeType } from "ilo-nasin";

	import Tree from "./Tree.svelte";

	const SHOWN = 5;

	type Outcome =
		| { kind: "empty" }
		| { kind: "parsed"; results: Result[] }
		| { kind: "incomplete" }
		| { kind: "unexpected"; offset: number; word: string };

	let text = $state("sina ken ala toki pona e ijo la, sina sona ala e ijo.");
	let showAll = $state(false);

	const outcome: Outcome = $derived.by(() => {
		if (!text.trim()) return { kind: "empty" };
		try {
			const results = parse(text);
			return results.length
				? { kind: "parsed", results }
				: { kind: "incomplete" };
		} catch (e) {
			// nearley attaches the token it couldn't accept.
			const token = (e as { token?: { value: string; offset: number } })
				.token;
			if (!token) throw e;
			return {
				kind: "unexpected",
				offset: token.offset,
				word: token.value,
			};
		}
	});

	const results = $derived(outcome.kind === "parsed" ? outcome.results : []);
	const shown = $derived(showAll ? results : results.slice(0, SHOWN));
	const depth = (tree: TreeType): number =>
		tree.type === "word" ? 2 : 1 + Math.max(...tree.children.map(depth));

	const overhang = (tree: TreeType) => {
		const levels = depth(tree) - 1;
		// padding (0.25rem) and border (2px) below the parent
		return `calc(${0.75 + levels * 0.5}rem - ${levels * 2}px)`;
	};

	const percent = (p: number) =>
		p >= 0.995 || p < 0.005
			? `${Math.round(p * 100)}%`
			: `${(p * 100).toFixed(1)}%`;
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
			{results.length === 1
				? "1 parse found."
				: `${results.length} parses found.`}
		{:else if outcome.kind === "incomplete"}
			Unexpected end of input.
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
		<section class="mt-4 mb-20">
			{#if results.length > 1}
				<h2 class="text-xl font-bold">
					Parse {i + 1}
					<span class="text-sm font-normal text-gray-500">
						({percent(result.score)})
					</span>
				</h2>
			{/if}
			<div
				class="-mx-8 overflow-x-auto px-8"
				style:padding-bottom={overhang(result.tree)}
				style:margin-bottom="calc(-1 * {overhang(result.tree)})"
			>
				<Tree tree={result.tree} />
			</div>
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
