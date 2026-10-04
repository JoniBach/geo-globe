<!--
  Find a place: type a name (suggestions as you type, from Photon), or coordinates
  ("53.07, -4.08"), or use where you are. Enter picks the first suggestion.
-->
<script lang="ts">
	import type { App } from '$lib/app.svelte';
	import { formatLonLat } from '$lib/geo';
	import { parseCoordinates, searchPlaces, SUGGESTIONS, type Found } from '$lib/search';

	let { app }: { app: App } = $props();

	let q = $state('');
	let results = $state<Found[]>([]);
	let active = $state(-1);
	let open = $state(false);
	let busy = $state(false);
	let note = $state('');
	const coords = $derived(parseCoordinates(q));

	// look names up as they're typed: a short pause first, and only the latest answer counts
	$effect(() => {
		const text = q.trim();
		if (text.length < 2 || coords) {
			results = [];
			return;
		}
		const stop = new AbortController();
		const timer = setTimeout(async () => {
			busy = true;
			try {
				results = await searchPlaces(text, stop.signal);
				active = -1;
				note = results.length ? '' : 'Nothing found by that name';
			} catch {
				if (!stop.signal.aborted) note = 'Search is unavailable: try coordinates';
			} finally {
				busy = false;
			}
		}, 250);
		return () => {
			clearTimeout(timer);
			stop.abort();
		};
	});

	function pick(f: { name: string; lon: number; lat: number }) {
		app.go({ name: f.name, lon: f.lon, lat: f.lat });
		q = '';
		results = [];
		open = false;
	}

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (coords) pick({ ...coords, name: formatLonLat(coords, 3) });
		else if (results.length) pick(results[Math.max(0, active)]);
	}

	function keys(e: KeyboardEvent) {
		if (!results.length) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			open = true;
			active = (active + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length;
		} else if (e.key === 'Escape') open = false;
	}

	function here() {
		note = 'Finding you…';
		navigator.geolocation.getCurrentPosition(
			(p) => {
				note = '';
				pick({ name: 'Where I am', lon: p.coords.longitude, lat: p.coords.latitude });
			},
			() => (note = 'Location is off: search for a place instead'),
			{ timeout: 10000 }
		);
	}
</script>

<form class="search" class:placed={!!app.loaded} role="search" onsubmit={submit}>
	<label for="q" class="sr">Search for a place, or type coordinates</label>
	<div class="box">
		<input
			id="q"
			type="search"
			autocomplete="off"
			placeholder="A place, or 53.07, -4.08"
			bind:value={q}
			onfocus={() => (open = true)}
			onblur={() => setTimeout(() => (open = false), 150)}
			onkeydown={keys}
			role="combobox"
			aria-expanded={open && results.length > 0}
			aria-controls="q-results"
			aria-autocomplete="list"
			aria-activedescendant={active >= 0 ? `q-${active}` : undefined}
		/>
		<button type="submit" class="go" aria-label="Go">{busy ? '…' : '→'}</button>
	</div>
	{#if coords}
		<p class="hint">Enter to go to {formatLonLat(coords, 3)}</p>
	{/if}
	{#if open && results.length}
		<ul id="q-results" role="listbox" class="results">
			{#each results as r, i (i)}
				<li id="q-{i}" role="option" aria-selected={i === active}>
					<button type="button" class:on={i === active} onmousedown={(e) => e.preventDefault()} onclick={() => pick(r)}>
						<strong>{r.name}</strong>
						<span>{[r.kind, r.detail].filter(Boolean).join(' · ')}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if note}<p class="hint" role="status">{note}</p>{/if}
	<div class="chips-row">
		<button type="button" class="mini" onclick={here}><span aria-hidden="true">◎</span> Where I am</button>
		{#each SUGGESTIONS as s (s.name)}
			<button type="button" class="mini" onclick={() => pick(s)}>{s.name}</button>
		{/each}
	</div>
</form>

<style>
	.search {
		position: relative;
	}
	.box {
		display: flex;
		gap: 6px;
	}
	input {
		flex: 1;
		min-width: 0;
		min-height: 42px;
		padding: 0 14px;
		border: 0;
		border-radius: 999px;
		background: #fff;
		color: var(--text);
		font: inherit;
		font-size: 15px;
		box-shadow: inset 0 0 0 1px var(--line);
	}
	input::placeholder {
		color: var(--muted);
	}
	.go {
		flex: none;
		width: 42px;
		height: 42px;
		border: 0;
		border-radius: 50%;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 18px;
		cursor: pointer;
		box-shadow: 0 3px 0 color-mix(in srgb, var(--accent) 55%, #000);
	}
	.results {
		position: absolute;
		z-index: 5;
		left: 0;
		right: 48px;
		top: 48px;
		margin: 0;
		padding: 6px;
		list-style: none;
		border-radius: var(--radius-sm);
		background: var(--card);
		box-shadow: var(--shadow), 0 0 0 1px var(--line);
	}
	.results button {
		display: grid;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: none;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.results button:hover,
	.results button.on {
		background: var(--accent-soft);
	}
	.results span {
		font-size: 12px;
		color: var(--muted);
	}
	.hint {
		margin: 6px 4px 0;
		font-size: 12px;
		color: var(--muted);
	}
	.chips-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 10px;
	}
	.mini {
		min-height: 30px;
		padding: 0 10px;
		border: 0;
		border-radius: 999px;
		background: var(--card);
		color: var(--text);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
		box-shadow: 0 0 0 1px var(--line);
	}
	.mini:hover {
		background: var(--accent-soft);
	}
	/* phones: once a place is showing, the suggestions wait until you're searching again */
	@media (max-width: 600px) {
		.placed:not(:focus-within) .chips-row {
			display: none;
		}
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
