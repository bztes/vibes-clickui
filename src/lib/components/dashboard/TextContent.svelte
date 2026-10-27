<script lang="ts">
	let { content }: { content: string } = $props();

	const escape = (s: string) =>
		s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

	/** a tiny, safe markdown subset: headings, bold, italics, code, links, lists */
	function inline(s: string) {
		return escape(s)
			.replace(
				/`([^`]+)`/g,
				'<code class="rounded bg-surface-3 px-1 font-mono text-[0.9em]">$1</code>'
			)
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/\*([^*]+)\*/g, '<em>$1</em>')
			.replace(
				/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
				'<a class="text-accent hover:underline" href="$2">$1</a>'
			);
	}

	const html = $derived.by(() => {
		const out: string[] = [];
		let list = false;
		for (const line of content.split('\n')) {
			const item = /^\s*[-*]\s+(.*)$/.exec(line);
			if (item) {
				if (!list) out.push('<ul class="my-1 list-disc pl-5">');
				list = true;
				out.push(`<li>${inline(item[1])}</li>`);
				continue;
			}
			if (list) out.push('</ul>');
			list = false;
			const h = /^(#{1,3})\s+(.*)$/.exec(line);
			if (h) {
				const size = ['text-xl', 'text-lg', 'text-base'][h[1].length - 1];
				out.push(`<p class="${size} mt-2 mb-1 font-semibold">${inline(h[2])}</p>`);
			} else if (line.trim()) out.push(`<p class="my-1">${inline(line)}</p>`);
		}
		if (list) out.push('</ul>');
		return out.join('');
	});
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- content is escaped before the markdown subset is applied -->
<div class="h-full overflow-auto text-sm leading-relaxed text-fg-2">{@html html}</div>
