<script lang="ts">
	import SqlAssist from './SqlAssist.svelte';

	let {
		value = $bindable(''),
		onrun,
		rows = 10,
		datasource = '',
		class: className = ''
	}: {
		value?: string;
		onrun?: () => void;
		rows?: number;
		/** data source the insert menu reads tables and values from */
		datasource?: string;
		class?: string;
	} = $props();

	const KEYWORDS =
		/\b(SELECT|FROM|WHERE|GROUP|BY|ORDER|LIMIT|AS|AND|OR|NOT|IN|LIKE|ILIKE|ON|JOIN|LEFT|RIGHT|INNER|ARRAY|UNION|ALL|DISTINCT|HAVING|WITH|FILL|STEP|CASE|WHEN|THEN|ELSE|END|DESC|ASC|BETWEEN|IS|NULL|INTERVAL|SECOND|MINUTE|HOUR|DAY|OVER|PARTITION|ROWS|PRECEDING|CURRENT|ROW|SETTINGS|FORMAT)\b/gi;

	const escape = (s: string) =>
		s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

	/** tokenizes so strings and comments are never highlighted as keywords */
	const highlighted = $derived.by(() => {
		const re =
			/('(?:\\.|[^'\\])*'?)|(--[^\n]*)|(\$__[A-Za-z_]+|\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*)|([^'$-]+|[$-])/g;
		let out = '';
		for (const m of value.matchAll(re)) {
			if (m[1]) out += `<span class="text-good">${escape(m[1])}</span>`;
			else if (m[2]) out += `<span class="text-muted italic">${escape(m[2])}</span>`;
			else if (m[3]) out += `<span class="text-violet">${escape(m[3])}</span>`;
			else out += escape(m[4]).replace(KEYWORDS, '<span class="text-blue font-medium">$1</span>');
		}
		// trailing newline needs content to keep both layers the same height
		return out + '\n';
	});

	let pre: HTMLPreElement;
	let textarea: HTMLTextAreaElement;
	let assist = $state<{
		x: number;
		y: number;
		start: number;
		end: number;
	} | null>(null);

	/** viewport position of a text offset, measured on the highlight layer that mirrors the textarea */
	function caretPosition(offset: number) {
		const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
		let rest = offset;
		for (
			let node = walker.nextNode() as Text | null;
			node;
			node = walker.nextNode() as Text | null
		) {
			if (rest <= node.length) {
				const range = document.createRange();
				range.setStart(node, rest);
				range.setEnd(node, Math.min(rest + 1, node.length));
				const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
				return { x: rect.left, y: rect.bottom };
			}
			rest -= node.length;
		}
		const rect = textarea.getBoundingClientRect();
		return { x: rect.left, y: rect.top };
	}

	function openAssist() {
		const { selectionStart: start, selectionEnd: end } = textarea;
		assist = { ...caretPosition(start), start, end };
	}

	function closeAssist() {
		if (!assist) return;
		const { start, end } = assist;
		assist = null;
		textarea.focus();
		textarea.setSelectionRange(start, end);
	}

	function replaceRange(text: string, start: number, end: number) {
		textarea.focus();
		textarea.setSelectionRange(start, end);
		// execCommand keeps the insert on the undo stack; setRangeText is the fallback
		if (!document.execCommand('insertText', false, text)) {
			textarea.setRangeText(text, start, end, 'end');
			textarea.dispatchEvent(new Event('input', { bubbles: true }));
		}
	}

	function insert(text: string) {
		if (!assist) return;
		const { start, end } = assist;
		assist = null;
		replaceRange(text, start, end);
	}

	/** inserts at the caret, or the end when the editor never had focus; the textarea keeps its selection while blurred */
	export function insertText(text: string) {
		const { selectionStart: start, selectionEnd: end } = textarea;
		const before = value.slice(0, start);
		replaceRange(before && !/\s$/.test(before) ? ` ${text}` : text, start, end);
	}

	function keydown(e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
		// most browsers keep Ctrl+Tab for switching tabs, so Ctrl+Space works as well
		if (e.ctrlKey && (e.key === 'Tab' || e.code === 'Space')) {
			e.preventDefault();
			openAssist();
		} else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			onrun?.();
		} else if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			const el = e.currentTarget;
			const { selectionStart: s, selectionEnd: end } = el;
			value = value.slice(0, s) + '  ' + value.slice(end);
			requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
		}
	}
</script>

<div
	class={[
		'group relative overflow-hidden rounded-md border border-line bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25',
		className
	]}
>
	<!-- eslint-disable svelte/no-at-html-tags -- every token is escaped before highlighting -->
	<pre
		bind:this={pre}
		aria-hidden="true"
		class="pointer-events-none absolute inset-0 m-0 overflow-hidden p-3 font-mono text-[13px] leading-5 break-words whitespace-pre-wrap text-fg">{@html highlighted}</pre>
	<!-- eslint-enable svelte/no-at-html-tags -->
	<textarea
		bind:this={textarea}
		bind:value
		{rows}
		spellcheck="false"
		autocapitalize="off"
		autocomplete="off"
		class="relative block w-full resize-y bg-transparent p-3 font-mono text-[13px] leading-5 break-words whitespace-pre-wrap text-transparent caret-fg outline-none selection:bg-accent/30 selection:text-transparent"
		onkeydown={keydown}
		onscroll={(e) => {
			pre.scrollTop = e.currentTarget.scrollTop;
		}}
		aria-label="SQL query"></textarea>
	<div
		class={[
			'absolute top-1.5 right-1.5 flex gap-1 group-focus-within:opacity-100 group-hover:opacity-100',
			value.trim() ? 'opacity-0' : 'opacity-100'
		]}
	>
		<button
			type="button"
			class="cursor-pointer rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-muted hover:text-fg"
			title="Insert a condition, column, value, table or template (Ctrl+Space / Ctrl+Tab)"
			onpointerdown={(e) => e.preventDefault()}
			onclick={openAssist}>Insert <kbd>⌃Space</kbd></button
		>
	</div>
</div>
{#if assist}
	<SqlAssist
		{datasource}
		x={assist.x}
		y={assist.y}
		oninsert={insert}
		onclose={closeAssist}
	/>
{/if}
