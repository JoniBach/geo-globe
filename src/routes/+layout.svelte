<!--
  The shared look: the "postcard" design tokens (warm paper, soft pastels, deep slate ink, one
  terracotta accent), fonts (Fraunces for headings, Figtree for everything else) and the settings
  controls (pills, toggle chips, sliders) the panels use.
-->
<script lang="ts">
	import '@fontsource-variable/fraunces/full.css';
	import '@fontsource-variable/figtree';
	let { children } = $props();
</script>

{@render children()}

<style>
	:global(:root) {
		/* surfaces */
		--paper: #fbf6ec;
		--card: #fffdf8;
		--glass: rgb(255 253 248 / 0.88);
		--sheet-bg: #fffdf8;
		/* ink: text contrast on paper is 12:1 (text) and 7.4:1 (muted), WCAG AAA */
		--ink: #263238;
		--text: var(--ink);
		--muted: #46535a;
		--line: rgb(38 50 56 / 0.14);
		/* the one strong colour: buttons and the current thing. The -inks are for text: 7:1 or more on
		   paper and on their own pastel */
		--accent: #c2562d;
		--accent-ink: #7a2e0f;
		--accent-soft: #f9e2d6;
		--on-accent: #fff;
		/* pastels, each with an ink that reads on it */
		--sage: #d5e8d8;
		--sage-ink: #214a32;
		--sky: #d9e9f3;
		--sky-ink: #1f4560;
		--butter: #f7e9b8;
		--butter-ink: #524008;
		--lilac: #e6def3;
		--lilac-ink: #44356a;
		--peach: var(--accent-soft);
		/* shape */
		--radius: 20px;
		--radius-sm: 12px;
		--shadow: 0 10px 30px rgb(70 55 30 / 0.12), 0 2px 6px rgb(70 55 30 / 0.06);
		--press: 0 3px 0 rgb(38 50 56 / 0.18);
		--font-display: 'Fraunces Variable', Georgia, serif;
		--font-ui: 'Figtree Variable', system-ui, sans-serif;
	}
	/*
	  Settings controls, shared by the views' customise drawers and sheets:
	  <fieldset class="knobs"><legend>…</legend> <div class="pills"><button aria-pressed>…</button></div>
	  <label class="chip"><input type="checkbox" /><span class="tick"></span>…</label>
	  <label class="slider"><span>Name <output>…</output></span><input type="range" /></label>
	*/
	:global(.knobs) {
		margin: 14px 0 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	:global(.knobs legend) {
		margin-bottom: 6px;
		padding: 0;
		font-size: 11px;
		font-weight: 750;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}
	:global(.pills),
	:global(.chips) {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	:global(.pills button),
	:global(.chip) {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 34px;
		padding: 0 12px;
		border: 0;
		border-radius: 999px;
		background: var(--card);
		color: var(--text);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
		box-shadow: 0 0 0 1px var(--line);
	}
	:global(.pills button:hover),
	:global(.chip:hover) {
		background: var(--accent-soft);
	}
	:global(.pills button[aria-pressed='true']) {
		background: var(--ink);
		color: var(--paper);
		box-shadow: none;
		font-weight: 650;
	}
	/* toggle chips: the checkbox is hidden but is still the control (and takes focus) */
	:global(.chip input) {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
		margin: 0;
	}
	:global(.chip:has(input:focus-visible)) {
		outline: 3px solid color-mix(in srgb, var(--accent) 70%, transparent);
	}
	:global(.chip .tick) {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--ink) 35%, transparent);
	}
	:global(.chip:has(input:checked)) {
		background: var(--sage);
		color: var(--sage-ink);
		box-shadow: none;
		font-weight: 650;
	}
	:global(.chip:has(input:checked) .tick) {
		background: var(--sage-ink);
		box-shadow: inset 0 0 0 3px var(--sage);
	}
	:global(.slider) {
		display: grid;
		gap: 2px;
		margin-top: 12px;
		font-size: 13px;
		font-weight: 650;
	}
	:global(.slider > span) {
		display: flex;
		justify-content: space-between;
	}
	:global(.slider output) {
		color: var(--muted);
		font-weight: 500;
	}
	:global(.slider input) {
		width: 100%;
		accent-color: var(--accent);
	}
	/*
	  Themed, "safe" scrolling for panels. Add class="scroll-y" / "scroll-x".
	  - the bar gets its own gutter (never drawn over content) and sits inset from rounded corners
	  - overscroll-behavior stops a panel's wheel scroll leaking into the scene's zoom
	*/
	:global(.scroll-y) {
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
	}
	:global(.scroll-x) {
		overflow-x: auto;
		overflow-y: hidden;
		overscroll-behavior: contain;
		padding-bottom: 6px;
	}
	:global(.scroll-y::-webkit-scrollbar),
	:global(.scroll-x::-webkit-scrollbar) {
		width: 6px;
		height: 6px;
	}
	:global(.scroll-y::-webkit-scrollbar-track),
	:global(.scroll-x::-webkit-scrollbar-track) {
		background: transparent;
	}
	:global(.scroll-y::-webkit-scrollbar-track) {
		margin: 16px 0;
	}
	:global(.scroll-x::-webkit-scrollbar-track) {
		margin: 0 16px;
	}
	:global(.scroll-y::-webkit-scrollbar-thumb),
	:global(.scroll-x::-webkit-scrollbar-thumb) {
		border-radius: 6px;
		background: color-mix(in srgb, var(--ink) 22%, transparent);
	}
	:global(.scroll-y::-webkit-scrollbar-thumb:hover),
	:global(.scroll-x::-webkit-scrollbar-thumb:hover) {
		background: color-mix(in srgb, var(--ink) 40%, transparent);
	}
	@supports (-moz-appearance: none) {
		:global(.scroll-y),
		:global(.scroll-x) {
			scrollbar-width: thin;
			scrollbar-color: color-mix(in srgb, var(--ink) 25%, transparent) transparent;
		}
	}
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: var(--paper);
		color: var(--text);
		font-family: var(--font-ui);
		-webkit-font-smoothing: antialiased;
	}
	/* the globe fills the window: nothing scrolls */
	:global(html, body) {
		overflow: hidden;
		overscroll-behavior: none;
	}
	:global(:focus-visible) {
		outline: 3px solid color-mix(in srgb, var(--accent) 70%, transparent);
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(*),
		:global(*::before),
		:global(*::after) {
			animation-duration: 0.01ms !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
