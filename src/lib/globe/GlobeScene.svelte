<!--
  The globe: a place's landscape as a round diorama on a plinth. North is always the same way (-z);
  you turn the globe by orbiting the camera, it never turns itself. The sun and moon sit where they
  really are for that place and moment, and set the light, the shadows' direction and (via onsky)
  the sky behind. The weather is the forecast for that hour.
-->
<script lang="ts" module>
	import { Vector3 as V3 } from 'three';
	/**
	 * Where the sun and moon last were on screen, carried from one place's globe to the next so they
	 * glide to their new places instead of jumping (null before the first place).
	 */
	const carried: { sun: V3 | null; moon: V3 | null } = { sun: null, moon: null };
</script>

<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { CanvasTexture, Color, Group, Mesh, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, Vector3 } from 'three';
	import type { App, Loaded } from '$lib/app.svelte';
	import type { Imagery } from '$lib/imagery';
	import { weatherAt } from '$lib/weather';
	import DioramaTerrain from './DioramaTerrain.svelte';
	import GlobeHalo from './GlobeHalo.svelte';
	import GlobeLabels from './GlobeLabels.svelte';
	import GlobeLines from './GlobeLines.svelte';
	import GlobeWeather from './GlobeWeather.svelte';
	import Marker from './Marker.svelte';
	import { globeLines } from './lines';
	import { direction, moonAt, skyColours, sunAt } from './sky';
	import { easeLight, type LightGoal } from './lighting';
	import { GlobeState } from './state';

	let {
		app,
		data,
		imagery,
		onsky,
		onshadow,
		rise
	}: {
		app: App;
		data: Loaded;
		imagery: Imagery;
		onsky: (top: string, bottom: string) => void;
		/** how dark the plinth's shadow should be */
		onshadow: (s: number) => void;
		/** how far the relief has risen out of the plinth, 0 (flat) to 1: the stage's transitions */
		rise: () => number;
	} = $props();

	/** the globe's size on screen (scene units): fixed; the landscape is scaled to fit it */
	const V = 1800;
	// svelte-ignore state_referenced_locally — a new place or size remounts this scene
	const R = data.radius;
	const RAD = Math.PI / 180;
	const globe = new GlobeState(V);

	// the map's lines: roads, rivers, park edges (each follows its switch)
	const lines = $derived(globeLines(data.map, { roads: app.layers.roads, rivers: app.layers.water, parks: app.layers.parks }));

	// the landscape group: scaled so its radius R fills the globe's fixed size V, floor at y = 0
	const land = new Group();
	let exag = $state(2);
	/** labels stand at full height: they wait until the land has risen */
	let settled = $state(false);
	// the land fades away only at the very end of its fall, and back in at the very start of its rise
	const shown = () => {
		const u = Math.min(1, rise() / 0.18);
		return u * u * (3 - 2 * u);
	};
	// the surroundings keep their full height and open out like an aperture instead; this holds
	// them level while the land beside them rises
	let haloLift = $state(0);
	// …and as it goes flat it drops just below the plinth's floor (two surfaces at one height flicker)
	let sink = $state(0);
	let centreHeight = $state(0);

	// sun and moon: small bodies on a wide arc around the globe
	const ORBIT = V * 1.55;
	const glow = (() => {
		const c = document.createElement('canvas');
		c.width = c.height = 128;
		const ctx = c.getContext('2d')!;
		const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
		g.addColorStop(0, 'rgba(255, 244, 214, 1)');
		g.addColorStop(0.25, 'rgba(255, 214, 140, 0.9)');
		g.addColorStop(1, 'rgba(255, 200, 120, 0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 128, 128);
		return new CanvasTexture(c);
	})();
	// the moon lit by the sun: its phase shows for free
	const moonGeo = new SphereGeometry(V * 0.05, 32, 16);
	const moonMat = new ShaderMaterial({
		uniforms: { uSun: { value: new Vector3(0, 1, 0) } },
		vertexShader: /* glsl */ `
			varying vec3 vN;
			void main() {
				vN = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uSun;
			varying vec3 vN;
			void main() {
				float lit = smoothstep(-0.05, 0.15, dot(normalize(vN), uSun));
				gl_FragColor = vec4(mix(vec3(0.42, 0.46, 0.58), vec3(0.98, 0.96, 0.90), lit), 1.0);
			}
		`
	});

	const sunBody = new Sprite(new SpriteMaterial({ map: glow, depthWrite: false, transparent: true }));
	sunBody.scale.setScalar(V * 0.32);
	const moonBody = new Mesh(moonGeo, moonMat);
	let shadow = 0.5;
	const goal: LightGoal = { colour: new Color(), strength: 1, dir: new Vector3(0, 1, 0), daylight: 1, hemi: 1, hemiColour: new Color() };
	const night = new Vector3(0.2, 1, 0.3).normalize();
	const sunGoal = new Vector3();
	const moonGoal = new Vector3();
	let sunNow: Vector3 | null = null;
	let moonNow: Vector3 | null = null;

	let sunLight = $state<import('three').DirectionalLight>();
	let hemi = $state<import('three').HemisphereLight>();
	let sky = '';

	useTask((dt) => {
		app.advance(Math.min(dt, 0.1));
		const r = rise();
		exag = app.exaggeration * r;
		if (settled !== r > 0.999) settled = r > 0.999;
		haloLift = Number.isFinite(globe.base) ? globe.base * (exag - app.exaggeration) : 0;
		// in the land's own metres (it's scaled by V / R): 3% of the globe's size below the floor at flat
		sink = -(1 - shown()) * V * 0.03 * (R / V);
		const k = V / R;
		land.scale.setScalar(k);
		if (Number.isFinite(globe.base)) land.position.set(0, -globe.base * exag * k, 0);
		centreHeight = globe.ground(0, 0);

		// weather now
		const w = weatherAt(data.weather, app.time);
		globe.weather = w;
		const drizzle = w && w.code >= 51 && w.code <= 57 ? 0.25 : 0;
		globe.rain = app.layers.weather && w ? Math.min(1, Math.max(drizzle, w.precip / 1.5)) : 0;

		// sun and moon for this place and moment
		const { lon, lat } = data.spot;
		const sun = sunAt(app.time, lat, lon);
		const moon = moonAt(app.time, lat, lon);
		// glide from where they were (the last place's sky) to where they really are, on a big arc;
		// once there, follow the clock closely (quick enough for fast playback)
		sunGoal.set(...direction(sun));
		moonGoal.set(...direction(moon));
		if (!sunNow) sunNow = (carried.sun ?? sunGoal).clone();
		if (!moonNow) moonNow = (carried.moon ?? moonGoal).clone();
		const glide = (now: Vector3, goal: Vector3) => {
			const far = now.angleTo(goal);
			now.lerp(goal, Math.min(1, dt * (far > 0.05 ? 2.2 : 12))).normalize();
		};
		glide(sunNow, sunGoal);
		glide(moonNow, moonGoal);
		carried.sun = sunNow.clone();
		carried.moon = moonNow.clone();
		globe.sunDir.copy(sunNow);
		globe.moonDir.copy(moonNow);
		sunBody.position.copy(globe.sunDir).multiplyScalar(ORBIT);
		moonBody.position.copy(globe.moonDir).multiplyScalar(ORBIT);
		// up when above the horizon, and in or out with the land between places
		const here = Math.min(1, r * 1.5);
		sunBody.visible = globe.sunDir.y > Math.sin(-2 * RAD) && here > 0.01;
		sunBody.material.opacity = here;
		moonBody.visible = globe.moonDir.y > Math.sin(-2 * RAD) && sun.alt < 12 * RAD && here > 0.01;
		moonBody.scale.setScalar(Math.max(0.001, here));
		moonMat.uniforms.uSun.value.copy(globe.sunDir);

		// light: the sun by day; the moon (or a faint sky glow) by night. Worked out for this moment,
		// then eased from whatever light the globe had, so it glides rather than snapping
		const deg = sun.alt / RAD;
		const daylight = Math.min(1, Math.max(0, (deg + 8) / 16));
		const colours = skyColours(sun.alt, app.layers.weather && w ? w.cloud / 100 : 0, globe.rain);
		goal.colour.set(colours.light);
		if (deg > -3) {
			goal.dir.copy(globe.sunDir);
			if (goal.dir.y < 0.08) goal.dir.setY(0.08).normalize(); // grazing, never from below
			goal.strength = 0.25 + 0.75 * Math.min(1, Math.max(0, (deg + 3) / 20));
		} else {
			goal.dir.copy(moon.alt > 0 ? globe.moonDir : night);
			goal.strength = moon.alt > 0 ? 0.3 : 0.12;
		}
		// overcast softens the direct light
		if (app.layers.weather && w) goal.strength *= 1 - 0.45 * (w.cloud / 100);
		goal.daylight = daylight;
		goal.hemi = 0.55 + 0.6 * daylight;
		goal.hemiColour.set(colours.top);
		const now = easeLight(goal, dt);
		globe.daylight = now.daylight;
		globe.light.copy(now.colour);
		globe.lightDir.copy(now.dir);
		globe.lightStrength = now.strength;
		if (sunLight) {
			sunLight.position.copy(now.dir).multiplyScalar(V * 3);
			sunLight.color.copy(now.colour);
			sunLight.intensity = now.strength * 1.6;
		}
		if (hemi) {
			hemi.intensity = now.hemi;
			hemi.color.copy(now.hemiColour);
		}
		const s = Math.round((0.2 + 0.35 * now.daylight) * 20) / 20;
		if (s !== shadow) {
			shadow = s;
			onshadow(s);
		}
		const next = colours.top + colours.bottom;
		if (next !== sky) {
			sky = next;
			onsky(colours.top, colours.bottom);
		}
	});

	$effect(() => imagery.show(app.surface, data.spot, R * 1.02));

	$effect(() => () => {
		glow.dispose();
		sunBody.material.dispose();
		moonGeo.dispose();
		moonMat.dispose();
	});
</script>

<T.HemisphereLight bind:ref={hemi} args={['#dfeef7', '#d8cbb4', 1.2]} />
<T.DirectionalLight bind:ref={sunLight} position={[V, V * 2, V]} intensity={2} />

<T is={land}>
	<T.Group scale.y={exag} position.y={sink}>
		<DioramaTerrain {app} {data} {globe} {imagery} fade={shown} />
		{#if lines.length}<GlobeLines {globe} radius={R} {lines} fade={shown} />{/if}
	</T.Group>
	{#if app.halo}
		<T.Group scale.y={app.exaggeration} position.y={haloLift}>
			<GlobeHalo {globe} radius={R} heights={data.far} contours={app.layers.contours} {lines} open={rise} fogIn={app.fogIn} fogOut={data.fogOut} />
		</T.Group>
	{/if}
	{#if settled}
		{#if app.layers.labels}<GlobeLabels {globe} radius={R} places={data.map.places} exaggeration={app.exaggeration} />{/if}
	{/if}
	{#if app.layers.marker}<Marker radius={R} ground={centreHeight} exaggeration={exag} />{/if}
</T>

<GlobeWeather {globe} show={app.layers.weather} presence={rise} />

<T is={sunBody} />
<T is={moonBody} />
