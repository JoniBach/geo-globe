<!--
  The card in the corner: search, the place on the globe (where it is, how high, the park it's in,
  the weather now), and a "Customise" drawer for how the globe looks.
-->
<script lang="ts">
	import { DEFAULTS, FOG_GAP, FOG_MAX, FOG_MIN, type App } from '$lib/app.svelte';
	import { formatLonLat } from '$lib/geo';
	import type { Surface } from '$lib/imagery';
	import { parkAt } from '$lib/osm';
	import { weatherAt, weatherLabel } from '$lib/weather';
	import Search from './Search.svelte';

	let { app }: { app: App } = $props();

	const data = $derived(app.loaded);
	const height = $derived(data ? Math.round(Math.max(0, data.near(0, 0))) : null);
	const park = $derived(data ? parkAt(data.map.parks, 0, 0) : null);
	const wx = $derived(data ? weatherAt(data.weather, app.time) : null);

	const surfaces: { id: Surface; label: string }[] = [
		{ id: 'painted', label: 'Painted' },
		{ id: 'satellite', label: 'Satellite' },
		{ id: 'sentinel', label: 'Sentinel-2' },
		{ id: 'topo', label: 'Topo' }
	];
	const toggles: { key: keyof App['layers']; label: string }[] = [
		{ key: 'contours', label: 'Elevation lines' },
		{ key: 'roads', label: 'Roads' },
		{ key: 'water', label: 'Water' },
		{ key: 'parks', label: 'Parks' },
		{ key: 'weather', label: 'Weather' },
		{ key: 'labels', label: 'Place names' },
		{ key: 'marker', label: 'Pin' }
	];

	// size and the surroundings' reach rebuild the globe (new data): shown while dragging, applied on release
	// svelte-ignore state_referenced_locally
	let size = $state(app.radius);
	// svelte-ignore state_referenced_locally
	let reach = $state(app.fogOut);
	const km = (m: number) => `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
	const reload = () => app.loaded && app.go(app.loaded.spot);

	function reset() {
		app.surface = DEFAULTS.surface;
		app.exaggeration = DEFAULTS.exaggeration;
		app.halo = DEFAULTS.halo;
		app.fogIn = DEFAULTS.fogIn;
		const rebuild = app.radius !== DEFAULTS.radius || app.fogOut !== DEFAULTS.fogOut;
		size = app.radius = DEFAULTS.radius;
		reach = app.fogOut = DEFAULTS.fogOut;
		for (const k of Object.keys(app.layers) as (keyof App['layers'])[]) app.layers[k] = true;
		if (rebuild) reload();
	}
</script>

<section class="panel scroll-y" aria-label="Place and settings">
	<h1 class="brand"><span class="mark" aria-hidden="true">◍</span> Geo Globe</h1>
	<Search {app} />

	{#if app.error}<p class="error" role="alert">{app.error}</p>{/if}
	{#if app.pending}<p class="loading" role="status">Fetching the land, the map and the weather…</p>{/if}

	{#if data}
		<div class="place">
			<h2>{data.spot.name}</h2>
			<p class="facts">
				{formatLonLat(data.spot)}{#if height !== null}{' · '}{height.toLocaleString()} m{/if}
			</p>
			<p class="tags">
				{#if park && app.layers.parks}<span class="tag sage"><span aria-hidden="true">⛰</span> {park}</span>{/if}
				{#if wx}
					{@const l = weatherLabel(wx.code, wx.isDay)}
					<span class="tag sky"><span aria-hidden="true">{l.icon}</span> {l.label}, {Math.round(wx.temp)}°C · wind {Math.round(wx.wind)} mph</span>
				{/if}
			</p>
		</div>
	{:else if !app.pending}
		<p class="intro">Pick somewhere and its landscape rises out of the plinth: real heights, the real sun and moon for the time of day, and today's weather there.</p>
	{/if}

	<details class="customise">
		<summary>Customise the globe</summary>
		<fieldset class="knobs">
			<legend>Surface</legend>
			<div class="pills">
				{#each surfaces as s (s.id)}
					<button type="button" aria-pressed={app.surface === s.id} onclick={() => (app.surface = s.id)}>{s.label}</button>
				{/each}
			</div>
		</fieldset>
		<fieldset class="knobs">
			<legend>Show</legend>
			<div class="chips">
				{#each toggles as t (t.key)}
					<label class="chip"><input type="checkbox" bind:checked={app.layers[t.key]} /><span class="tick" aria-hidden="true"></span>{t.label}</label>
				{/each}
				<label class="chip"><input type="checkbox" bind:checked={app.halo} /><span class="tick" aria-hidden="true"></span>Surroundings</label>
			</div>
		</fieldset>
		<label class="slider">
			<span>Size <output>{km(size)} to the rim</output></span>
			<input
				type="range"
				min="800"
				max="6000"
				step="200"
				bind:value={size}
				onchange={() => {
					app.radius = size;
					reload();
				}}
				aria-valuetext="{km(size)} from the centre to the rim"
			/>
		</label>
		<label class="slider">
			<span>Relief <output>{app.exaggeration.toFixed(1)}×</output></span>
			<input type="range" min="1" max="4" step="0.1" bind:value={app.exaggeration} />
		</label>
		{#if app.halo}
			<label class="slider">
				<span>Surroundings begin <output>{km(app.fogIn * app.radius)}</output></span>
				<input type="range" min={FOG_MIN} max={reach - FOG_GAP} step="0.05" bind:value={app.fogIn} />
			</label>
			<label class="slider">
				<span>…and fade out by <output>{km(reach * app.radius)}</output></span>
				<input
					type="range"
					min={app.fogIn + FOG_GAP}
					max={FOG_MAX}
					step="0.05"
					bind:value={reach}
					onchange={() => {
						app.fogOut = reach;
						reload();
					}}
				/>
			</label>
		{/if}
		<button type="button" class="reset" onclick={reset}><span aria-hidden="true">↺</span> Reset to the defaults</button>
		<p class="hint">Drag to turn the globe · scroll or pinch to zoom.</p>
	</details>
</section>

<style>
	.panel {
		position: absolute;
		z-index: 40; /* above the place names on the globe (z-index up to 30) */
		top: 16px;
		left: 16px;
		box-sizing: border-box;
		width: min(380px, calc(100% - 32px));
		max-height: calc(100dvh - 140px);
		padding: 16px 18px;
		border-radius: var(--radius);
		background: var(--glass);
		backdrop-filter: blur(12px);
		box-shadow:
			var(--shadow),
			0 0 0 1px var(--line);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 12px;
		font-family: var(--font-display);
		font-size: 22px;
		font-variation-settings:
			'SOFT' 100,
			'WONK' 1;
	}
	.mark {
		color: var(--accent);
	}
	.place {
		margin-top: 14px;
	}
	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 24px;
		line-height: 1.15;
	}
	.facts {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 8px 0 0;
	}
	.tags:empty {
		display: none;
	}
	.tag {
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 650;
	}
	.sage {
		background: var(--sage);
		color: var(--sage-ink);
	}
	.sky {
		background: var(--sky);
		color: var(--sky-ink);
	}
	.intro,
	.loading,
	.error {
		margin: 12px 0 0;
		font-size: 14px;
		line-height: 1.45;
	}
	.loading {
		color: var(--muted);
	}
	.error {
		color: var(--accent-ink);
	}
	.customise {
		margin-top: 14px;
		border-top: 1px solid var(--line);
		padding-top: 10px;
	}
	summary {
		font-weight: 650;
		cursor: pointer;
	}
	.reset {
		margin-top: 14px;
		min-height: 34px;
		padding: 0 14px;
		border: 0;
		border-radius: 999px;
		background: var(--card);
		color: var(--text);
		font: inherit;
		font-size: 13px;
		font-weight: 650;
		cursor: pointer;
		box-shadow:
			var(--press),
			0 0 0 1px var(--line);
	}
	.hint {
		margin: 10px 0 0;
		font-size: 12px;
		color: var(--muted);
	}
	@media (max-width: 600px) {
		.panel {
			top: 10px;
			left: 10px;
			width: calc(100% - 20px);
			max-height: 46dvh;
			padding: 12px 14px;
		}
	}
</style>
