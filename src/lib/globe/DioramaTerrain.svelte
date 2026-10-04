<!--
  The globe's landscape: a disc of terrain centred on the place, cut cleanly at radius R, with a
  wall of layered earth around its edge down to the plinth. A grid of heights becomes a mesh; a
  custom shader paints it (pastel by height, or the imagery), lights it by the real sun or moon,
  shimmers the water and engraves the elevation lines.
  Lives inside a group scaled on Y by the vertical exaggeration.
-->
<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { BufferAttribute, BufferGeometry, DoubleSide, ShaderMaterial, Vector3, Color } from 'three';
	import type { App, Loaded } from '$lib/app.svelte';
	import type { Imagery } from '$lib/imagery';
	import type { GlobeState } from './state';

	let {
		app,
		data,
		globe,
		imagery,
		fade
	}: {
		app: App;
		data: Loaded;
		globe: GlobeState;
		imagery: Imagery;
		/** 1 the land shows, 0 it has faded away (the stage's transitions) */
		fade?: () => number;
	} = $props();

	// svelte-ignore state_referenced_locally — a new place (or size) remounts this component
	const { radius: R, near, far, map } = data;
	// svelte-ignore state_referenced_locally — shared and fixed for the component's lifetime
	const shared = { globe, imagery };

	// ~20 m where the tiles are that sharp; coarser on big globes, so the grid stays ~200 × 200
	const CELL = Math.max(20, Math.round(R / 90));
	const HALF = Math.ceil(R / CELL) + 2;
	const SIDE = HALF * 2 + 1;
	/** earth below the lowest ground in the disc, as a share of the radius (before exaggeration) */
	const DEPTH = 0.05;

	/** best height we have: the sharp tiles, else the coarse ones; the sea is level at 0 */
	const ground = (x: number, n: number) => {
		let h = near(x, n);
		if (!Number.isFinite(h)) h = far(x, n);
		return Math.max(0, Number.isFinite(h) ? h : 0);
	};

	// ---- the disc: a square grid of heights; the shader cuts it to a circle --------------------
	const positions = new Float32Array(SIDE * SIDE * 3);
	const normals = new Float32Array(SIDE * SIDE * 3);
	const wet = new Float32Array(SIDE * SIDE);
	const grid = new Float32Array(SIDE * SIDE);
	const index: number[] = [];
	for (let r = 0; r < SIDE - 1; r++)
		for (let c = 0; c < SIDE - 1; c++) {
			const a = r * SIDE + c;
			index.push(a, a + SIDE, a + 1, a + 1, a + SIDE, a + SIDE + 1);
		}

	// one row and column of extra heights all round, for the normals at the edge
	const W = SIDE + 2;
	const hs = new Float32Array(W * W);
	for (let r = 0; r < W; r++) for (let c = 0; c < W; c++) hs[r * W + c] = ground((c - 1 - HALF) * CELL, -(r - 1 - HALF) * CELL);
	let low = Infinity;
	let high = -Infinity;
	for (let r = 0; r < SIDE; r++)
		for (let c = 0; c < SIDE; c++) {
			const x = (c - HALF) * CELL;
			const n = -(r - HALF) * CELL;
			const k = (r + 1) * W + (c + 1);
			const o = (r * SIDE + c) * 3;
			// scene space: x east, y up, z south
			positions[o] = x;
			positions[o + 1] = hs[k];
			positions[o + 2] = -n;
			grid[r * SIDE + c] = hs[k];
			if (Math.hypot(x, n) < R) {
				low = Math.min(low, hs[k]);
				high = Math.max(high, hs[k]);
			}
			wet[r * SIDE + c] = map.waterAt(x, n);
			// the surface's normal from its neighbours' heights (central differences)
			const nx = -(hs[k + 1] - hs[k - 1]);
			const ny = 2 * CELL;
			const nz = -(hs[k + W] - hs[k - W]);
			const len = Math.hypot(nx, ny, nz);
			normals[o] = nx / len;
			normals[o + 1] = ny / len;
			normals[o + 2] = nz / len;
		}
	const tall = high - Math.max(0, low) > 950;
	const geometry = new BufferGeometry();
	geometry.setIndex(index);
	geometry.setAttribute('position', new BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new BufferAttribute(normals, 3));
	geometry.setAttribute('aWater', new BufferAttribute(wet, 1));

	/** Height from the grid, interpolated as the mesh draws it: for the lines and labels on the land. */
	function gridHeight(x: number, n: number): number {
		const fc = Math.max(0, Math.min(SIDE - 1.001, x / CELL + HALF));
		const fr = Math.max(0, Math.min(SIDE - 1.001, -n / CELL + HALF));
		const c = Math.floor(fc);
		const r = Math.floor(fr);
		const a = fc - c;
		const b = fr - r;
		const i = r * SIDE + c;
		return (grid[i] * (1 - a) + grid[i + 1] * a) * (1 - b) + (grid[i + SIDE] * (1 - a) + grid[i + SIDE + 1] * a) * b;
	}
	// tell the rest of the globe where the floor is and how to read the ground
	shared.globe.baseGoal = low - DEPTH * R;
	if (!Number.isFinite(shared.globe.base)) shared.globe.base = shared.globe.baseGoal;
	shared.globe.ground = gridHeight;
	shared.globe.patch = { x: 0, n: 0, reach: R };
	shared.globe.version++;

	// shared lighting: hillshade from the sun (or moon), a soft sky fill, tinted by the light
	const LIGHT_GLSL = /* glsl */ `
		uniform vec3 uLightDir;
		uniform vec3 uLight;
		uniform float uStrength;
		uniform float uDay;
		uniform float uFade;
		/** how much light falls on a surface facing n (about 0.35 in shade at night .. 0.95 in full sun) */
		vec3 lightAt(vec3 n) {
			float diff = max(dot(n, uLightDir), 0.0);
			vec3 sky = mix(vec3(0.34, 0.38, 0.52), vec3(0.62, 0.66, 0.70), uDay);
			vec3 k = sky + uLight * diff * uStrength;
			// soft ceiling: a clear midday sun can't wash the pastel land out
			vec3 over = max(k - 0.9, 0.0);
			return min(k, vec3(0.9)) + over / (1.0 + over * 3.0);
		}
		vec3 lit(vec3 base, vec3 n) {
			return base * lightAt(n);
		}
	`;

	const lightUniforms = () => ({
		uLightDir: { value: new Vector3(0, 1, 0) },
		uLight: { value: new Color('#ffffff') },
		uStrength: { value: 1 },
		uDay: { value: 1 },
		uExag: { value: 2 },
		uFade: { value: 1 }
	});

	const material = new ShaderMaterial({
		uniforms: {
			...lightUniforms(),
			uR: { value: R },
			// the painted colours run from meadow (sea level) to pale stone (950 m and up). Where the
			// land here rises more than that, they run from its lowest ground to its highest
			// instead, so the Alps and the Grand Canyon aren't all snow
			uLow: { value: tall ? Math.max(0, low) : 0 },
			uSpan: { value: tall ? high - Math.max(0, low) : 950 },
			uTime: { value: 0 },
			uWater: { value: 1 },
			uContours: { value: 1 },
			uImg: { value: shared.imagery.texture },
			uImgU: { value: shared.imagery.imgU },
			uImgV: { value: shared.imagery.imgV },
			uMapMix: { value: 0 },
			uPhoto: { value: 0 }
		},
		vertexShader: /* glsl */ `
			uniform float uExag;
			attribute float aWater;
			varying float vH;
			varying vec2 vXZ;
			varying vec3 vN;
			varying float vWater;
			void main() {
				vWater = aWater;
				vH = position.y;
				vXZ = position.xz;
				// the group is scaled by uExag on y: normals scale by the inverse
				vN = normalize(vec3(normal.x, normal.y / uExag, normal.z));
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			${LIGHT_GLSL}
			uniform float uR;
			uniform float uLow;
			uniform float uSpan;
			uniform float uTime;
			uniform float uWater;
			uniform float uContours;
			uniform sampler2D uImg;
			uniform vec3 uImgU;
			uniform vec3 uImgV;
			uniform float uMapMix;
			uniform float uPhoto;
			const float PHOTO_EXPOSURE = 4.0;
			varying float vH;
			varying vec2 vXZ;
			varying vec3 vN;
			varying float vWater;

			// soft pastel land by height: meadow, heath, bracken, pale stone
			vec3 pastel(float h) {
				vec3 c = mix(vec3(0.72, 0.84, 0.60), vec3(0.80, 0.84, 0.58), smoothstep(0.0, 200.0, h));
				c = mix(c, vec3(0.86, 0.78, 0.60), smoothstep(200.0, 450.0, h));
				c = mix(c, vec3(0.80, 0.74, 0.68), smoothstep(450.0, 700.0, h));
				c = mix(c, vec3(0.93, 0.92, 0.90), smoothstep(700.0, 950.0, h));
				return c;
			}

			void main() {
				// cut the square grid to a circle
				float d = length(vXZ);
				if (d > uR) discard;
				vec3 n = normalize(vN);
				vec3 col = pastel((vH - uLow) / uSpan * 950.0);

				// the imagery: local metres -> texture uv (x east, n north = -z)
				vec3 xn1 = vec3(vXZ.x, -vXZ.y, 1.0);
				vec2 uv = vec2(dot(uImgU, xn1), dot(uImgV, xn1));
				vec4 tex = texture2D(uImg, uv);
				vec3 img = tex.rgb;
				// tiles still loading (or missing): the pastel land, not black
				float have = tex.a * step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
				// photographs are far darker than the pastel land: an exposure curve lifts the shadows
				// and mid-tones and rolls the highlights off towards white, on the brightness only (the
				// colours keep their hue). A printed map (topo) is already light: as it is.
				float l = dot(img, vec3(0.2126, 0.7152, 0.0722));
				float lifted = (1.0 - exp(-PHOTO_EXPOSURE * l)) / (1.0 - exp(-PHOTO_EXPOSURE));
				vec3 photo = img * (lifted / max(l, 1e-3));
				photo = mix(vec3(lifted), photo, 1.08);
				img = mix(img, clamp(photo, 0.0, 1.0), uPhoto);

				// water: pale, with a slow soft shimmer
				float w = smoothstep(0.42, 0.58, vWater) * uWater * (1.0 - 0.6 * uMapMix);
				float sea = step(vH, 0.5);
				float shimmer = sin(dot(vXZ, vec2(0.009, 0.004)) + uTime * 0.5) * sin(dot(vXZ, vec2(-0.003, 0.007)) - uTime * 0.3);
				vec3 water = vec3(0.62, 0.80, 0.90) + vec3(0.05) * shimmer;
				float wet = max(w, sea);
				n = normalize(mix(n, vec3(0.0, 1.0, 0.0), wet));
				vec3 sun = lightAt(n);
				// the pastel land takes the full hillshade; imagery already has the real sun and shade in
				// it, so it only takes a gentle share of the relief (and the dusk-to-night dimming)
				vec3 relief = clamp(sun / 0.9, 0.45, 1.05);
				vec3 kImg = mix(0.55, 1.0, uDay) * mix(vec3(1.0), relief, 0.4);
				vec3 land = mix(col * sun, img * kImg, uMapMix * have);
				col = mix(land, water * sun, wet);

				// elevation lines: fine every 20 m, stronger every 100 m, drawn like an engraving.
				// fwidth: how fast the height changes per pixel, so every line is about a pixel wide
				float k = vH / 20.0;
				float line = 1.0 - min(abs(fract(k - 0.5) - 0.5) / max(fwidth(k), 1e-4), 1.0);
				float m = vH / 100.0;
				float major = 1.0 - min(abs(fract(m - 0.5) - 0.5) / max(fwidth(m), 1e-4), 1.0);
				float ink = (line * 0.22 + major * 0.45) * uContours * (1.0 - max(w, sea));
				col = mix(col, vec3(0.30, 0.26, 0.22), ink);

				// a hairline where the land meets the rim
				col *= 1.0 - 0.25 * smoothstep(uR - 12.0, uR, d);
				gl_FragColor = vec4(col, uFade);
			}
		`
	});

	// ---- the rim: a wall of layered earth down to the plinth -----------------------------------
	const SEG = 256;
	const wallPos = new Float32Array((SEG + 1) * 2 * 3);
	const wallNorm = new Float32Array((SEG + 1) * 2 * 3);
	const wallTop = new Float32Array((SEG + 1) * 2);
	const wallAng = new Float32Array((SEG + 1) * 2); // angle around the rim: the strata's waves
	const wallIndex: number[] = [];
	for (let k = 0; k < SEG; k++) {
		const a = k * 2;
		wallIndex.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
	}
	for (let k = 0; k <= SEG; k++) {
		const t = (k / SEG) * Math.PI * 2;
		for (const j of [0, 1]) {
			wallNorm.set([Math.cos(t), 0, -Math.sin(t)], (k * 2 + j) * 3);
			wallAng[k * 2 + j] = t;
		}
		// a touch above the mesh so no sky shows between land and rim
		const h = gridHeight(R * Math.cos(t), R * Math.sin(t)) + 1.5;
		wallTop[k * 2] = wallTop[k * 2 + 1] = h;
	}
	const wall = new BufferGeometry();
	wall.setIndex(wallIndex);
	wall.setAttribute('position', new BufferAttribute(wallPos, 3));
	wall.setAttribute('normal', new BufferAttribute(wallNorm, 3));
	wall.setAttribute('aTop', new BufferAttribute(wallTop, 1));
	wall.setAttribute('aAng', new BufferAttribute(wallAng, 1));

	const wallMat = new ShaderMaterial({
		side: DoubleSide,
		uniforms: { ...lightUniforms() },
		vertexShader: /* glsl */ `
			uniform float uExag;
			attribute float aTop;
			attribute float aAng;
			varying float vDepth;
			varying float vAng;
			varying vec3 vN;
			void main() {
				vDepth = (aTop - position.y) * uExag; // metres below the ground, as seen
				vAng = aAng;
				vN = normal;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			${LIGHT_GLSL}
			varying float vDepth;
			varying float vAng;
			varying vec3 vN;
			void main() {
				// turf, topsoil, then gently wavy bands of clay and stone
				float wave = sin(vAng * 23.0) * 6.0 + sin(vAng * 7.0) * 10.0;
				float z = vDepth + wave;
				vec3 col = vec3(0.55, 0.68, 0.42);
				col = mix(col, vec3(0.55, 0.42, 0.32), smoothstep(6.0, 14.0, vDepth));
				float bands = 0.5 + 0.5 * sin(z * 0.045);
				vec3 clay = mix(vec3(0.78, 0.66, 0.52), vec3(0.70, 0.60, 0.50), bands);
				col = mix(col, clay, smoothstep(40.0, 70.0, vDepth));
				col = mix(col, vec3(0.84, 0.80, 0.74), smoothstep(0.62, 0.7, sin(z * 0.013)) * smoothstep(90.0, 140.0, vDepth));
				gl_FragColor = vec4(lit(col, normalize(vN)), uFade);
			}
		`
	});

	useTask((dt) => {
		// ease the floor, so the diorama doesn't jump
		globe.base += (globe.baseGoal - globe.base) * Math.min(1, dt * 1.5);
		for (let k = 0; k <= SEG; k++) {
			const t = (k / SEG) * Math.PI * 2;
			const px = R * Math.cos(t);
			const pn = R * Math.sin(t);
			wallPos.set([px, wallTop[k * 2], -pn, px, globe.base, -pn], k * 6);
		}
		wall.attributes.position.needsUpdate = true;
		wall.computeBoundingSphere();

		const f = fade?.() ?? 1;
		for (const u of [material.uniforms, wallMat.uniforms]) {
			u.uLightDir.value.copy(globe.lightDir);
			u.uLight.value.copy(globe.light);
			u.uStrength.value = globe.lightStrength;
			u.uDay.value = globe.daylight;
			u.uExag.value = app.exaggeration;
			u.uFade.value = f;
		}
		// see-through only while fading: solid (and drawn with the solid things) the rest of the time
		material.transparent = wallMat.transparent = f < 0.999;
		const m = material.uniforms;
		m.uTime.value += dt;
		m.uWater.value = app.layers.water ? 1 : 0;
		m.uContours.value = app.layers.contours ? 1 : 0;
		m.uMapMix.value = imagery.mix;
		m.uPhoto.value = imagery.photo ? 1 : 0;
	});

	$effect(() => () => {
		geometry.dispose();
		material.dispose();
		wall.dispose();
		wallMat.dispose();
	});
</script>

<T.Mesh {geometry} {material} frustumCulled={false} />
<T.Mesh geometry={wall} material={wallMat} frustumCulled={false} />
