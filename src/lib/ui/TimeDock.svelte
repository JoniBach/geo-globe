<!--
  The time of day at the place: play the day through (the sun and moon cross the sky, the light and
  weather follow), or drag through it. Times are the place's own local time.
-->
<script lang="ts">
	import type { App } from '$lib/app.svelte';
	import { weatherAt, weatherLabel } from '$lib/weather';

	let { app }: { app: App } = $props();

	const day = $derived(app.day);
	const clock = $derived(app.clock());
	const progress = $derived(((app.time - day[0]) / 86400) * 100);
	const wx = $derived(weatherAt(app.loaded?.weather ?? null, app.time));
	const wxText = $derived(wx ? `${weatherLabel(wx.code, wx.isDay).label}, ${Math.round(wx.temp)}°C` : '');
	const wxIcon = $derived(wx ? weatherLabel(wx.code, wx.isDay).icon : '');

	function now() {
		app.playing = false;
		app.time = Date.now() / 1000;
	}

	function keys(e: KeyboardEvent) {
		// Space plays and pauses (not while typing in a field)
		const el = e.target as HTMLElement;
		if (e.key === ' ' && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName) && !el.isContentEditable) {
			e.preventDefault();
			app.playing = !app.playing;
		}
	}
</script>

<svelte:window onkeydown={keys} />

<div class="dock" role="group" aria-label="Time of day">
	<button type="button" class="pp" class:playing={app.playing} onclick={() => (app.playing = !app.playing)} aria-label={app.playing ? 'Pause' : 'Play the day'}
		>{app.playing ? '❚❚' : '▶'}</button
	>
	<select bind:value={app.rate} aria-label="Playback speed">
		<option value={120}>2 min/s</option>
		<option value={600}>10 min/s</option>
		<option value={1800}>30 min/s</option>
		<option value={3600}>1 h/s</option>
	</select>
	<span class="clock" aria-live="off">{clock}</span>
	<button type="button" class="now" onclick={now}>Now</button>
	{#if wxText}<span class="wx" title={wxText}><span aria-hidden="true">{wxIcon}</span> <span class="wxt">{wxText}</span></span>{/if}
	<input
		class="through"
		style:--p="{progress}%"
		type="range"
		min={day[0]}
		max={day[1] - 60}
		step="60"
		value={app.time}
		oninput={(e) => (app.time = +(e.currentTarget as HTMLInputElement).value)}
		aria-label="Time of day"
		aria-valuetext={clock}
	/>
</div>

<style>
	.dock {
		position: absolute;
		z-index: 40;
		left: 50%;
		bottom: 34px;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 12px;
		box-sizing: border-box;
		width: min(720px, calc(100% - 32px));
		padding: 8px 20px 8px 8px;
		border-radius: 999px;
		background: var(--glass);
		backdrop-filter: blur(12px);
		box-shadow:
			var(--shadow),
			0 0 0 1px var(--line);
	}
	.pp {
		flex: none;
		width: 52px;
		height: 52px;
		border: 0;
		border-radius: 50%;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 17px;
		cursor: pointer;
		box-shadow: 0 4px 0 color-mix(in srgb, var(--accent) 55%, #000);
	}
	.pp.playing {
		background: var(--ink);
		box-shadow: 0 4px 0 #000;
	}
	select,
	.now {
		flex: none;
		min-height: 34px;
		padding: 0 10px;
		border: 0;
		border-radius: 999px;
		background: var(--card);
		color: inherit;
		font: inherit;
		font-size: 13px;
		font-weight: 650;
		cursor: pointer;
		box-shadow: 0 0 0 1px var(--line);
	}
	.clock {
		flex: none;
		font-family: var(--font-display);
		font-size: 24px;
		font-variant-numeric: tabular-nums;
	}
	.wx {
		flex: none;
		font-size: 13px;
		color: var(--muted);
	}
	/* a fat rounded track, filled up to the time on screen */
	.through {
		flex: 1;
		min-width: 60px;
		height: 22px;
		margin: 0;
		background: none;
		appearance: none;
		-webkit-appearance: none;
		cursor: pointer;
	}
	.through::-webkit-slider-runnable-track {
		height: 10px;
		border-radius: 5px;
		background: linear-gradient(to right, var(--accent) var(--p), color-mix(in srgb, var(--ink) 14%, transparent) var(--p));
	}
	.through::-moz-range-track {
		height: 10px;
		border-radius: 5px;
		background: linear-gradient(to right, var(--accent) var(--p), color-mix(in srgb, var(--ink) 14%, transparent) var(--p));
	}
	.through::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 22px;
		height: 22px;
		margin-top: -6px;
		border-radius: 50%;
		background: #fff;
		box-shadow:
			0 0 0 3px var(--accent),
			0 2px 4px rgb(0 0 0 / 0.2);
	}
	.through::-moz-range-thumb {
		width: 22px;
		height: 22px;
		border: 0;
		border-radius: 50%;
		background: #fff;
		box-shadow:
			0 0 0 3px var(--accent),
			0 2px 4px rgb(0 0 0 / 0.2);
	}
	@media (max-width: 700px) {
		.dock {
			bottom: 46px;
			gap: 8px;
			padding-right: 14px;
		}
		.pp {
			width: 44px;
			height: 44px;
		}
		.clock {
			font-size: 20px;
		}
		.wxt,
		.now {
			display: none;
		}
	}
</style>
