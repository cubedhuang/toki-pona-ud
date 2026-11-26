<script lang="ts">
	import type { Tree as TreeType } from "ilo-nasin";

	import Tree from "./Tree.svelte";

	let { tree, isHead = false }: { tree: TreeType; isHead?: boolean } =
		$props();

	const readable = (name: string) => name.replaceAll("_", " ");
</script>

{#if tree.type === "word"}
	<div
		class="relative top-3 -mt-3 w-fit rounded-lg border-2 border-blue-300 bg-blue-50 p-1"
	>
		<p
			class={[
				"text-xs whitespace-nowrap",
				isHead ? "font-semibold text-blue-900" : "text-blue-600",
			]}
		>
			{readable(tree.role)}
		</p>
		<div class="mt-0.5 flex justify-center">
			<p
				class="relative top-3 -mt-3 rounded-lg border-2 border-green-300 bg-green-50 px-1 py-0.5 text-sm"
			>
				{tree.text}
			</p>
		</div>
	</div>
{:else}
	<div
		class="relative top-3 -mt-3 w-fit rounded-lg border-2 border-gray-200 bg-white p-1"
	>
		<p
			class={[
				"text-xs whitespace-nowrap",
				isHead ? "font-semibold text-gray-900" : "text-gray-500",
			]}
		>
			{readable(tree.label)}
		</p>
		<div class="mt-0.5 flex items-end justify-center gap-1">
			{#each tree.children as child, i}
				<Tree tree={child} isHead={tree.head === i} />
			{/each}
		</div>
	</div>
{/if}
