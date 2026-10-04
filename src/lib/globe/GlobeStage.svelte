<!--
  One globe for the whole visit: the camera, its controls and the plinth stay put, and only the
  land on the plinth changes. Going somewhere new lets the relief sink flat into the plinth and the
  new land's hills rise up out of it: straight up and down, so it feels like the same globe
  changing rather than a new scene. While the next place loads, the old land waits half sunk.
-->
<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import type { PerspectiveCamera } from 'three';
	import type { App, Loaded } from '$lib/app.svelte';
	import { formatLonLat } from '$lib/geo';
	import type { Imagery } from '$lib/imagery';
	import GlobeOverview from './GlobeOverview.svelte';
	import GlobeScene from './GlobeScene.svelte';
	import Plinth from './Plinth.svelte';
	import { busy } from './FrameGovernor.svelte';

	let {
		app,
		imagery,
		onshown,
		onsky
	}: {
		app: App;
		imagery: Imagery;
		/** the land now on the plinth changed (the sky follows it) */
		onshown: (data: Loaded | null) => void;
		onsky: (top: string, bottom: string) => void;
	} = $props();

	const V = 1800;
	let width = $state(globalThis.innerWidth ?? 1);
	let height = $state(globalThis.innerHeight ?? 1);
	// pull back on tall, narrow screens so the whole globe fits across
	// svelte-ignore state_referenced_locally — the first frame only; after that the viewer's orbit wins
	const fit = Math.max(1, 1.25 / Math.max(0.3, width / height));

	// phones: the card covers the top of the screen, so draw the globe lower down (a view offset
	// shifts the picture without moving the camera, so turning the globe still pivots on its centre)
	let camera = $state<PerspectiveCamera>();
	$effect(() => {
		if (!camera) return;
		if (width < 700 && height > width) camera.setViewOffset(width, height, 0, -height * 0.16, width, height);
		else camera.clearViewOffset();
	});

	// what's on the plinth now, and how far its relief has risen (0 flat .. 1 full height)
	// svelte-ignore state_referenced_locally — starts with whatever's loaded, then animates
	let shown = $state.raw<Loaded | null>(app.loaded);
	// the plinth's shadow eases to where the land on it wants it
	let shadow = $state(0.5);
	let shadowGoal = 0.5;
	const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

	let rise = 1;
	const risen = () => rise;
	let phase: 'idle' | 'fall' | 'rise' = 'idle';
	let t = 0;
	let from = 1;
	const FALL = 0.7;
	const RISE = 1.4;
	const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
	const clamp = (u: number) => Math.min(1, Math.max(0, u));

	function swap() {
		shown = app.loaded;
		shadowGoal = 0.5;
		onshown(shown);
	}

	useTask((dt) => {
		const target = app.loaded;
		const waiting = app.pending;
		// full frame rate through a change of place, and a moment after (the light and sun settle)
		if (phase !== 'idle' || waiting) busy(1500);
		const eased = shadow + (shadowGoal - shadow) * Math.min(1, dt * 2);
		if (Math.abs(eased - shadow) > 0.004) shadow = eased;
		if (still) {
			if (target !== shown && !waiting) swap();
			rise = 1;
			return;
		}
		if (phase === 'idle') {
			if (target !== shown && !waiting) {
				phase = 'fall';
				t = 0;
				from = rise;
			} else {
				// waiting for the next place: sink part way and hold; otherwise stand at full height
				const goal = waiting ? 0.35 : 1;
				rise += (goal - rise) * Math.min(1, dt * 4);
			}
		} else if (phase === 'fall') {
			t += dt;
			rise = from * (1 - easeInOut(clamp(t / FALL)));
			if (t >= FALL) {
				swap();
				phase = 'rise';
				t = 0;
				rise = 0;
			}
		} else {
			t += dt;
			rise = easeInOut(clamp(t / RISE));
			if (t >= RISE) phase = 'idle';
		}
	});

	// lettered around the plinth: the place, and where it is
	const plinth = $derived(
		shown ? { title: shown.spot.name, date: formatLonLat(shown.spot, 3) } : { title: 'Geo Globe', date: 'Anywhere on Earth' }
	);
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

<T.PerspectiveCamera bind:ref={camera} makeDefault position={[0, V * 2.1 * fit, V * 3.9 * fit]} fov={34} near={V * 0.01} far={V * 40}>
	<OrbitControls target={[0, V * 0.04, 0]} enablePan={false} enableDamping minDistance={V * 1.3} maxDistance={V * 6 * fit} maxPolarAngle={Math.PI * 0.47} />
</T.PerspectiveCamera>

<!-- the lettering fades out as the land falls and back in as the new land rises -->
<Plinth R={V} title={plinth.title} date={plinth.date} {shadow} lettering={() => (phase === 'idle' ? 1 : rise)} />

<!-- a keyed list, not {#if}: a place's scene keeps its own data to the end, never null mid-teardown -->
{#each shown ? [shown] : [] as data (data)}
	<GlobeScene {app} {data} {imagery} {onsky} rise={risen} onshadow={(s) => (shadowGoal = s)} />
{:else}
	<GlobeOverview rise={risen} />
{/each}
