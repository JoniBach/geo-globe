<!--
  The globe before anywhere is chosen: the same plinth with a flat meadow on top (fields,
  hedgerows, a country road), a few clouds drifting over. Search for a place and the real
  landscape grows in the meadow's place (GlobeStage). You can turn it like the real globes.
-->
<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { CanvasTexture, CylinderGeometry, SRGBColorSpace } from 'three';
	import type { WeatherSample } from '$lib/weather';
	import GlobeWeather from './GlobeWeather.svelte';
	import { GlobeState } from './state';
	import { easeLight, type LightGoal } from './lighting';
	import { Color, Vector3 } from 'three';

	let {
		rise
	}: {
		/** how far the meadow stands up out of the plinth, 0 to 1: the stage's transitions */
		rise?: () => number;
	} = $props();

	const V = 1800;
	/** the meadow stands this far above the plinth, on a band of earth */
	const TURF = V * 0.05;

	// a fair-weather sky: a few clouds on a light westerly
	const globe = new GlobeState(V);
	globe.weather = { cloud: 35, wind: 8, windDir: 250, precip: 0, code: 2, isDay: 1 } as WeatherSample;

	function meadow() {
		const S = 1024;
		const c = document.createElement('canvas');
		c.width = c.height = S;
		const ctx = c.getContext('2d')!;
		ctx.fillStyle = '#b9d99b';
		ctx.fillRect(0, 0, S, S);
		// fields: soft patches in a few greens and a hay yellow
		const rand = (() => {
			let s = 11;
			return () => (s = (s * 16807) % 2147483647) / 2147483647;
		})();
		const tones = ['#b0d392', '#c3dfa6', '#a8cc8c', '#d8dca0', '#bfdb9f'];
		for (let i = 0; i < 26; i++) {
			ctx.fillStyle = tones[i % tones.length];
			ctx.globalAlpha = 0.55;
			ctx.beginPath();
			const x = rand() * S;
			const y = rand() * S;
			const w = 120 + rand() * 220;
			const h = 90 + rand() * 180;
			ctx.ellipse(x, y, w / 2, h / 2, rand() * Math.PI, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
		// hedgerows: a patchwork, hedges along the edges of a jittered grid (some missing, so
		// fields merge), with the odd tree along them
		const N = 6;
		const cell = S / N;
		const pt = Array.from({ length: N + 1 }, (_, r) =>
			Array.from({ length: N + 1 }, (_, c) => [c * cell + (c % N ? (rand() - 0.5) * cell * 0.5 : 0), r * cell + (r % N ? (rand() - 0.5) * cell * 0.5 : 0)])
		);
		ctx.strokeStyle = '#86ab6c';
		ctx.lineWidth = 6;
		ctx.lineCap = 'round';
		const trees: [number, number][] = [];
		const hedge = (a: number[], b: number[]) => {
			if (rand() < 0.25) return;
			ctx.beginPath();
			ctx.moveTo(a[0], a[1]);
			// a slight bow, as field edges have
			ctx.quadraticCurveTo((a[0] + b[0]) / 2 + (rand() - 0.5) * 30, (a[1] + b[1]) / 2 + (rand() - 0.5) * 30, b[0], b[1]);
			ctx.stroke();
			for (let k = 0; k < 2; k++) {
				const t = rand();
				if (rand() < 0.6) trees.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
			}
		};
		for (let r = 0; r <= N; r++)
			for (let c = 0; c <= N; c++) {
				if (c < N) hedge(pt[r][c], pt[r][c + 1]);
				if (r < N) hedge(pt[r][c], pt[r + 1][c]);
			}
		ctx.fillStyle = '#6f9a58';
		for (const [x, y] of trees) {
			ctx.beginPath();
			ctx.arc(x, y, 7 + rand() * 6, 0, Math.PI * 2);
			ctx.fill();
		}
		// the road: west to east through the middle, a gentle S, with a dashed centre line
		const road = (w: number, style: string, dash: number[] = []) => {
			ctx.strokeStyle = style;
			ctx.lineWidth = w;
			ctx.setLineDash(dash);
			ctx.beginPath();
			ctx.moveTo(-20, S * 0.56);
			ctx.bezierCurveTo(S * 0.3, S * 0.64, S * 0.4, S * 0.5, S * 0.5, S * 0.5);
			ctx.bezierCurveTo(S * 0.62, S * 0.5, S * 0.72, S * 0.38, S + 20, S * 0.42);
			ctx.stroke();
			ctx.setLineDash([]);
		};
		road(34, '#9fb58a'); // verge
		road(26, '#e8e3d7');
		road(3, '#c9bfa9', [16, 16]);
		const t = new CanvasTexture(c);
		t.colorSpace = SRGBColorSpace;
		t.anisotropy = 8;
		return t;
	}

	function earth() {
		const c = document.createElement('canvas');
		c.width = 1024;
		c.height = 128;
		const ctx = c.getContext('2d')!;
		const bands: [number, string][] = [
			[0, '#8fb06f'], // turf
			[0.16, '#8a6a52'], // topsoil
			[0.42, '#c9ad8c'], // clay
			[0.7, '#b39c82'],
			[0.86, '#d8ccb8'] // stone
		];
		bands.forEach(([y, col], i) => {
			ctx.fillStyle = col;
			const next = bands[i + 1]?.[0] ?? 1;
			ctx.fillRect(0, y * 128, 1024, (next - y) * 128 + 1);
		});
		const t = new CanvasTexture(c);
		t.colorSpace = SRGBColorSpace;
		return t;
	}

	// the meadow's band of earth rises and falls with the stage
	let meadowGroup = $state<import('three').Group>();
	let grassMat = $state<import('three').MeshStandardMaterial>();
	let soilMat = $state<import('three').MeshStandardMaterial>();
	// a fair day's light, eased from whatever light the globe had (the last day's)
	const goal: LightGoal = {
		colour: new Color('#fff4e0'),
		strength: 2.2 / 1.6,
		dir: new Vector3(-1.5, 2.2, 1.2).normalize(),
		daylight: 1,
		hemi: 1.4,
		hemiColour: new Color('#dfeef7')
	};
	let sunLight = $state<import('three').DirectionalLight>();
	let hemi = $state<import('three').HemisphereLight>();
	useTask((dt) => {
		const now = easeLight(goal, dt);
		if (sunLight) {
			sunLight.position.copy(now.dir).multiplyScalar(V * 3);
			sunLight.color.copy(now.colour);
			sunLight.intensity = now.strength * 1.6;
		}
		if (hemi) {
			hemi.intensity = now.hemi;
			hemi.color.copy(now.hemiColour);
		}
	});
	useTask(() => {
		const r = Math.max(0.001, rise?.() ?? 1);
		if (meadowGroup) meadowGroup.scale.y = r;
		// and fades away only at the very end (and back in at the very start)
		const u = Math.min(1, r / 0.18);
		const o = u * u * (3 - 2 * u);
		// and drops below the plinth's floor as it goes flat (no flicker against it)
		if (meadowGroup) meadowGroup.position.y = -(1 - o) * V * 0.03;
		for (const m of [grassMat, soilMat]) if (m) m.opacity = o;
	});

	const grass = meadow();
	const soil = earth();
	const rim = new CylinderGeometry(V, V, TURF, 160, 1, true);

	$effect(() => () => {
		grass.dispose();
		soil.dispose();
		rim.dispose();
	});
</script>

<T.HemisphereLight bind:ref={hemi} args={['#dfeef7', '#d8cbb4', 1.4]} />
<T.DirectionalLight bind:ref={sunLight} position={[-V * 1.5, V * 2.2, V * 1.2]} intensity={2.2} color="#fff4e0" />

<!-- the meadow on its band of earth -->
<T.Group bind:ref={meadowGroup}>
	<T.Mesh geometry={rim} position.y={TURF / 2}>
		<T.MeshStandardMaterial bind:ref={soilMat} map={soil} roughness={0.95} transparent />
	</T.Mesh>
	<T.Mesh rotation.x={-Math.PI / 2} position.y={TURF}>
		<T.CircleGeometry args={[V, 160]} />
		<T.MeshStandardMaterial bind:ref={grassMat} map={grass} roughness={0.95} transparent />
	</T.Mesh>
</T.Group>

<GlobeWeather {globe} show presence={rise} />
