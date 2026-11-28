<script lang="ts">
	import type { UDToken } from "ilo-nasin";

	let { tokens }: { tokens: UDToken[] } = $props();

	const FONT = "16px 'Inter Variable', ui-sans-serif, system-ui, sans-serif";
	const SMALL = "12px 'Inter Variable', ui-sans-serif, system-ui, sans-serif";
	const GAP = 16;
	// Label width plus its white box and a short visible stub of bar each side.
	const LABEL_PAD = 20;
	const LEVEL = 16;
	const SPREAD = 6;
	const ARROW = 6;

	const context = new OffscreenCanvas(0, 0).getContext("2d")!;
	function measure(text: string, font: string) {
		context.font = font;
		return context.measureText(text).width;
	}

	const layout = $derived.by(() => {
		const widths = tokens.map((t) =>
			Math.max(measure(t.form, FONT), measure(t.upos, SMALL)),
		);

		// An arc sits one level above the highest arc inside it.
		const arcs = tokens
			.filter((t) => t.head > 0)
			.map((t) => ({
				token: t,
				from: Math.min(t.id, t.head),
				to: Math.max(t.id, t.head),
				level: 1,
				x1: 0,
				x2: 0,
			}))
			.sort((a, b) => a.to - a.from - (b.to - b.from));
		for (const arc of arcs) {
			for (const inner of arcs) {
				if (inner === arc) break;
				if (inner.from >= arc.from && inner.to <= arc.to) {
					arc.level = Math.max(arc.level, inner.level + 1);
				}
			}
		}

		// Spread the endpoints that land on each word so lines never cross:
		// arcs heading left on the left, then the root, then arcs heading
		// right. Within each side, taller arcs sit nearer the middle so their
		// verticals clear the bars of the shorter arcs. Offsets are relative
		// to the word's center for now.
		const ends = tokens.map(
			() => [] as { key: number; set: (x: number) => void }[],
		);
		for (const arc of arcs) {
			ends[arc.from - 1]!.push({
				key: 1000 - arc.level,
				set: (x) => (arc.x1 = x),
			});
			ends[arc.to - 1]!.push({
				key: arc.level - 1000,
				set: (x) => (arc.x2 = x),
			});
		}
		let rootX = 0;
		const root = tokens.find((t) => t.head === 0);
		if (root) ends[root.id - 1]!.push({ key: 0, set: (x) => (rootX = x) });
		ends.forEach((list, i) => {
			list.sort((a, b) => a.key - b.key);
			const step = Math.min(
				SPREAD,
				widths[i]! / Math.max(1, list.length - 1),
			);
			list.forEach((end, j) =>
				end.set((j - (list.length - 1) / 2) * step),
			);
		});

		// Place words left to right, each as far left as the minimum gap and
		// the labels of the arcs ending at it allow.
		const centers: number[] = [];
		tokens.forEach((_, i) => {
			let c =
				i === 0
					? widths[0]! / 2
					: centers[i - 1]! + (widths[i - 1]! + widths[i]!) / 2 + GAP;
			for (const arc of arcs) {
				if (arc.to !== i + 1) continue;
				const need = measure(arc.token.deprel, SMALL) + LABEL_PAD;
				c = Math.max(
					c,
					centers[arc.from - 1]! + arc.x1 - arc.x2 + need,
				);
			}
			centers.push(c);
		});
		for (const arc of arcs) {
			arc.x1 += centers[arc.from - 1]!;
			arc.x2 += centers[arc.to - 1]!;
		}
		if (root) rootX += centers[root.id - 1]!;

		const top = (Math.max(0, ...arcs.map((a) => a.level)) + 1) * LEVEL + 12;
		const last = tokens.length - 1;
		return {
			widths,
			centers,
			arcs,
			root,
			rootX,
			top,
			width: last < 0 ? 0 : centers[last]! + widths[last]! / 2,
		};
	});

	const center = (id: number) => layout.centers[id - 1]!;

	// The word under the pointer, and where to show its details.
	let hovered = $state<{ token: UDToken; x: number; y: number } | null>(null);
	let popupWidth = $state(0);
	let viewportWidth = $state(0);

	// Centered under the word, but kept inside the viewport.
	const popupLeft = $derived(
		hovered &&
			Math.max(
				8,
				Math.min(
					hovered.x - popupWidth / 2,
					viewportWidth - popupWidth - 8,
				),
			),
	);

	function show(token: UDToken, event: PointerEvent) {
		const box = (event.currentTarget as Element).getBoundingClientRect();
		hovered = { token, x: box.left + box.width / 2, y: box.bottom };
	}

	const sorted = (values: Record<string, string>) =>
		Object.entries(values).sort(([a], [b]) => a.localeCompare(b));

	function headOf(token: UDToken) {
		const head = tokens[token.head - 1];
		return head ? `${head.form} (${head.id})` : "root";
	}
</script>

{#snippet arrow(x: number)}
	<path
		d="M {x - 3} {layout.top - ARROW} L {x} {layout.top} L {x +
			3} {layout.top - ARROW} Z"
		class="fill-gray-400"
	/>
{/snippet}

{#snippet label(text: string, x: number, y: number)}
	{@const width = measure(text, SMALL) + 8}
	<rect x={x - width / 2} y={y - 7} {width} height={14} class="fill-white" />
	<text {x} y={y + 4} text-anchor="middle" class="fill-gray-600 text-[11px]">
		{text}
	</text>
{/snippet}

<svg
	class="overflow-visible"
	width={layout.width}
	height={layout.top + 40}
	role="img"
	aria-label="Dependency tree"
>
	{#each layout.arcs as { token, level, x1, x2 } (token.id)}
		{@const y = layout.top - level * LEVEL}
		{@const [head, dep] = token.id < token.head ? [x2, x1] : [x1, x2]}
		<path
			d="M {head} {layout.top} V {y} H {dep} V {layout.top - ARROW}"
			class="fill-none stroke-gray-400"
			stroke-width="1.5"
		/>
		{@render arrow(dep)}
	{/each}

	{#if layout.root}
		<line
			x1={layout.rootX}
			x2={layout.rootX}
			y1={14}
			y2={layout.top - ARROW}
			class="stroke-gray-400"
			stroke-width="1.5"
		/>
		{@render arrow(layout.rootX)}
		{@render label("root", layout.rootX, 6)}
	{/if}

	{#each layout.arcs as { token, level, x1, x2 } (token.id)}
		{@render label(token.deprel, (x1 + x2) / 2, layout.top - level * LEVEL)}
	{/each}

	{#each tokens as token (token.id)}
		<text
			x={center(token.id)}
			y={layout.top + 18}
			text-anchor="middle"
			class="fill-gray-900 text-sm"
		>
			{token.form}
		</text>
		<text
			x={center(token.id)}
			y={layout.top + 34}
			text-anchor="middle"
			class="fill-blue-600 text-[11px]"
		>
			{token.upos}
		</text>
		{@const width = layout.widths[token.id - 1]! + GAP}
		<rect
			x={center(token.id) - width / 2}
			y={layout.top + 2}
			{width}
			height={38}
			class="fill-transparent"
			role="presentation"
			onpointerenter={(event) => show(token, event)}
			onpointerleave={() => (hovered = null)}
		/>
	{/each}
</svg>

<svelte:window bind:innerWidth={viewportWidth} />

{#if hovered}
	{@const t = hovered.token}
	{@const feats = sorted(t.feats)}
	{@const misc = sorted(t.misc)}
	<div
		class="pointer-events-none fixed z-10 rounded-lg border-2 border-gray-200 bg-white px-3 py-2 text-xs shadow-md"
		style:left="{popupLeft}px"
		bind:offsetWidth={popupWidth}
		style:top="{hovered.y}px"
	>
		<p class="text-sm font-semibold text-gray-900">
			{t.form}
			<span class="font-normal text-gray-400">{t.id}</span>
		</p>
		<dl class="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
			<dt class="text-gray-500">Lemma</dt>
			<dd>{t.lemma}</dd>
			<dt class="text-gray-500">UPOS</dt>
			<dd class="text-blue-600">{t.upos}</dd>
			{#if t.xpos !== "_"}
				<dt class="text-gray-500">XPOS</dt>
				<dd>{t.xpos}</dd>
			{/if}
			{#if feats.length || misc.length}
				<hr class="my-1 border-gray-200 col-span-2" />
			{/if}
			{#each feats as [key, value] (key)}
				<dt class="text-gray-500">{key}</dt>
				<dd>{value}</dd>
			{/each}
			{#each misc as [key, value] (key)}
				<dt class="text-gray-500">{key}</dt>
				<dd>{value}</dd>
			{/each}
			<hr class="my-1 border-gray-200 col-span-2" />
			<dt class="text-gray-500">Head</dt>
			<dd>{headOf(t)}</dd>
			<dt class="text-gray-500">Relation</dt>
			<dd>{t.deprel}</dd>
		</dl>
	</div>
{/if}
