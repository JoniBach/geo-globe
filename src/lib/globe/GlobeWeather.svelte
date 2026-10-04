<!--
  Weather inside the globe, from the forecast for this hour: soft clouds
  (as many as the cloud cover says) drifting with the real wind, greying as it rains, and rain
  falling from them onto the land, slanted by the wind. All in scene space around the centre.
  Clouds come and go gently as the cover changes; between places (presence, from the stage) they
  lift away one after another and the next place's settle in the same way, the rain easing with them.
-->
<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
	import type { GlobeState } from './state';

	let {
		globe,
		show,
		presence
	}: {
		globe: GlobeState;
		show: boolean;
		/** 0..1: how settled the weather is (the stage's transitions); 1 when there's no stage */
		presence?: () => number;
	} = $props();

	// svelte-ignore state_referenced_locally — fixed for the component's lifetime
	const R = globe.R;
	const CLOUD_Y = R * 0.8;

	// ---- clouds ---------------------------------------------------------------------------------
	const MAX_CLOUDS = 5;
	const puffGeo = new SphereGeometry(1, 20, 14);
	// soft and bright: partly self-lit so they stay white rather than going grey in the shade
	const OPACITY = 0.82;
	const cloudMats = Array.from(
		{ length: MAX_CLOUDS },
		() => new MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.45, roughness: 1, transparent: true, opacity: OPACITY, depthWrite: false })
	);
	const rand = (() => {
		let s = 7;
		return () => ((s = (s * 16807) % 2147483647) / 2147483647);
	})();
	const clouds = Array.from({ length: MAX_CLOUDS }, (_, index) => {
		const g = new Group();
		const cloudMat = cloudMats[index];
		const size = R * (0.05 + rand() * 0.035);
		// a few overlapping puffs make one cloud
		for (let k = 0; k < 6; k++) {
			const m = new Mesh(puffGeo, cloudMat);
			const s = size * (0.55 + rand() * 0.55);
			m.scale.set(s, s * 0.55, s);
			m.position.set((rand() - 0.5) * size * 2.4, (rand() - 0.3) * size * 0.5, (rand() - 0.5) * size * 1.2);
			g.add(m);
		}
		// on: eases to 1 while the cover calls for this cloud, to 0 when it doesn't
		return { g, mat: cloudMat, lateral: (rand() - 0.5) * 1.3 * R, phase: rand(), lift: rand() * R * 0.12, on: 0 };
	});
	const root = new Group();
	for (const c of clouds) root.add(c.g);

	// ---- rain ------------------------------------------------------------------------------------
	const COUNT = 2500;
	const seeds = new Float32Array(COUNT * 2 * 3);
	const ends = new Float32Array(COUNT * 2);
	for (let i = 0; i < COUNT; i++) {
		const s = [Math.random(), Math.random(), Math.random()];
		seeds.set(s, i * 6);
		seeds.set(s, i * 6 + 3);
		ends[i * 2 + 1] = 1;
	}
	const rainGeo = new BufferGeometry();
	rainGeo.setAttribute('position', new BufferAttribute(new Float32Array(COUNT * 2 * 3), 3));
	rainGeo.setAttribute('aSeed', new BufferAttribute(seeds, 3));
	rainGeo.setAttribute('aEnd', new BufferAttribute(ends, 1));
	const rainMat = new ShaderMaterial({
		transparent: true,
		depthWrite: false,
		uniforms: {
			uR: { value: R * 0.85 },
			uTop: { value: CLOUD_Y },
			uTime: { value: 0 },
			uWind: { value: new Vector3() },
			uIntensity: { value: 0 },
			uColor: { value: new Color('#6f8fb0') }
		},
		vertexShader: /* glsl */ `
			uniform float uR;
			uniform float uTop;
			uniform float uTime;
			uniform vec3 uWind;
			uniform float uIntensity;
			attribute vec3 aSeed;
			attribute float aEnd;
			varying float vAlpha;
			void main() {
				float fall = uTop * 0.9;
				float ang = aSeed.x * 6.2831853;
				vec2 disc = vec2(cos(ang), sin(ang)) * sqrt(aSeed.z) * uR;
				float y = uTop - mod(aSeed.y * uTop + uTime * fall * (0.8 + 0.4 * fract(aSeed.x * 7.13)), uTop);
				vec3 p = vec3(disc.x, y, disc.y);
				// slant with the wind: drops drift downwind as they fall
				p.xz += uWind.xz * (uTop - y) / uTop * uR * 0.25;
				p += normalize(vec3(uWind.x * 0.3, -1.0, uWind.z * 0.3)) * aEnd * uR * 0.035;
				float live = step(fract(aSeed.x * 3.7 + aSeed.y * 1.3), uIntensity);
				// fade in just under the clouds
				vAlpha = live * smoothstep(uTop, uTop * 0.85, y) * (1.0 - aEnd * 0.7) * 0.7;
				gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			varying float vAlpha;
			void main() {
				if (vAlpha <= 0.0) discard;
				gl_FragColor = vec4(uColor, vAlpha);
			}
		`
	});

	const white = new Color('#ffffff');
	const rainy = new Color('#9aa5b1');
	const downwind = new Vector3(0, 0, 1);
	const across = new Vector3(1, 0, 0);
	let t = 0;

	useTask((dt) => {
		t += dt;
		const w = globe.weather;
		const cover = show && w ? w.cloud / 100 : 0;
		const mph = w?.wind ?? 5;
		if (w) {
			// windDir is where it blows FROM, clockwise from north; scene north is -z
			const to = ((w.windDir + 180) * Math.PI) / 180;
			downwind.set(Math.sin(to), 0, -Math.cos(to));
			across.set(-downwind.z, 0, downwind.x);
		}
		// drift across the globe and wrap, shrinking away at either side
		const span = R * 2;
		const speed = R * 0.012 * (1 + mph / 6);
		const n = Math.round(cover * MAX_CLOUDS);
		const here = Math.min(1, Math.max(0, presence?.() ?? 1));
		clouds.forEach((c, k) => {
			c.on += ((k < n ? 1 : 0) - c.on) * Math.min(1, dt * 0.8);
			// staggered: the first cloud settles first and leaves last
			const s = Math.min(1, Math.max(0, (here - k * 0.1) / 0.5));
			const settle = s * s * (3 - 2 * s);
			const amount = c.on * settle;
			c.g.visible = amount > 0.005;
			if (!c.g.visible) return;
			c.mat.color.copy(white).lerp(rainy, globe.rain);
			c.mat.emissive.copy(white).lerp(rainy, globe.rain);
			c.mat.opacity = OPACITY * amount;
			const along = ((((c.phase * span + t * speed) % span) + span) % span) - span / 2;
			const pos = downwind.clone().multiplyScalar(along).add(across.clone().multiplyScalar(c.lateral));
			const edge = Math.hypot(pos.x, pos.z) / R;
			c.g.scale.setScalar(Math.max(0.001, (1 - Math.max(0, edge - 0.6) / 0.35) * (0.7 + 0.3 * amount)));
			// lifted up and away as it leaves, settling down as it arrives
			c.g.position.set(pos.x, CLOUD_Y + c.lift + (1 - settle) * R * 0.5, pos.z);
		});
		const u = rainMat.uniforms;
		u.uTime.value = t;
		// the rain eases off before the clouds lift, and back on once they're down
		const r = Math.min(1, Math.max(0, (here - 0.5) / 0.5));
		u.uIntensity.value = show ? globe.rain * r * r * (3 - 2 * r) : 0;
		u.uWind.value.copy(downwind).multiplyScalar(Math.min(1, mph / 25));
	});

	$effect(() => () => {
		puffGeo.dispose();
		for (const m of cloudMats) m.dispose();
		rainGeo.dispose();
		rainMat.dispose();
	});
</script>

<T is={root} />
<T.LineSegments geometry={rainGeo} material={rainMat} frustumCulled={false} renderOrder={20} />
