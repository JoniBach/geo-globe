<!--
  The globe's surroundings: beyond the rim, faint elevation lines and the main roads, rivers and
  park edges carry on at their real heights, fading out into the air around the globe. Only lines:
  a see-through surface whose shader draws its contours and nothing else.
  Lives inside the group scaled on Y by the exaggeration (raw metres, local).
-->
<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { BufferAttribute, BufferGeometry, DoubleSide, ShaderMaterial } from 'three';
	import type { HeightAt } from '$lib/elevation';
	import type { GlobeLine } from './lines';
	import type { GlobeState } from './state';

	let {
		globe,
		radius,
		heights,
		contours,
		lines,
		open,
		fogIn = 1.2,
		fogOut = 2.6
	}: {
		globe: GlobeState;
		radius: number;
		/** coarse heights reaching out to the surroundings' edge */
		heights: HeightAt;
		contours: boolean;
		/** the map's lines (roads, rivers, park edges) to carry on past the rim */
		lines: GlobeLine[];
		/** how far the surroundings have opened out from the rim, 0 to 1, like an aperture (the stage's transitions) */
		open?: () => number;
		/** where the surroundings begin (a crisp edge, then a short fade-in), in multiples of the radius (live) */
		fogIn?: number;
		/** where the outer fog has closed in, and how far the surroundings reach (a new value rebuilds) */
		fogOut?: number;
	} = $props();

	// svelte-ignore state_referenced_locally — a new radius or reach remounts this component
	const R = radius;
	// svelte-ignore state_referenced_locally
	const OUTER = R * fogOut;
	// grid cells across: finer cells for a wider reach, within reason
	// svelte-ignore state_referenced_locally
	const N = Math.min(260, Math.round((160 * fogOut) / 2.6));
	const CELL = (OUTER * 2) / N;
	const ground = (x: number, n: number) => {
		const h = heights(x, n);
		return Number.isFinite(h) ? Math.max(0, h) : 0;
	};

	/** shared by every material out here: how visible a point is, by its distance from the centre */
	const fade = /* glsl */ `
		uniform float uInner;
		uniform float uOuter;
		uniform float uClear;
		uniform float uFadeFrom;
		uniform float uBase;
		uniform float uDip;
		uniform float uOpen;
		float haloFade(vec2 xz, float h) {
			float d = length(xz);
			// a crisp inner edge where the surroundings begin (uClear), then a short fade-in over a
			// quarter of their depth, and the outer fog closing in from uFadeFrom to uOuter
			if (d < uClear) return 0.0;
			float f = smoothstep(uClear, uClear + (uOuter - uClear) * 0.25, d) * (1.0 - smoothstep(uFadeFrom, uOuter, d));
			// the aperture: open out from the inner edge to the full reach, a soft edge on the way
			float edge = mix(uClear, uOuter * 1.08, uOpen);
			f *= 1.0 - smoothstep(edge - (uOuter - uInner) * 0.12, edge, d);
			// ground below the globe's floor would sit in front of the plinth: let it go
			return f * smoothstep(uBase - uDip, uBase, h);
		}
	`;
	const uniforms = () => ({
		uInner: { value: R },
		uOuter: { value: OUTER },
		uClear: { value: R * 1.2 },
		uFadeFrom: { value: OUTER * 0.7 },
		uBase: { value: 0 },
		uDip: { value: R * 0.08 },
		uOpen: { value: 1 }
	});

	// ---- elevation lines: a see-through surface that draws only its contours ------------------
	const S = N + 1;
	const positions = new Float32Array(S * S * 3);
	const index: number[] = [];
	for (let r = 0; r < N; r++)
		for (let c = 0; c < N; c++) {
			const a = r * S + c;
			index.push(a, a + S, a + 1, a + 1, a + S, a + S + 1);
		}
	for (let r = 0; r < S; r++)
		for (let c = 0; c < S; c++) {
			const x = -OUTER + c * CELL;
			const n = OUTER - r * CELL;
			positions.set([x, ground(x, n), -n], (r * S + c) * 3);
		}
	const surface = new BufferGeometry();
	surface.setIndex(index);
	surface.setAttribute('position', new BufferAttribute(positions, 3));
	surface.computeBoundingSphere();

	const surfaceMat = new ShaderMaterial({
		transparent: true,
		depthWrite: false,
		side: DoubleSide,
		uniforms: uniforms(),
		vertexShader: /* glsl */ `
			varying float vH;
			varying vec2 vXZ;
			void main() {
				vH = position.y;
				vXZ = position.xz;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			${fade}
			varying float vH;
			varying vec2 vXZ;
			void main() {
				float f = haloFade(vXZ, vH);
				if (f <= 0.001 || vH <= 0.5) discard; // nothing inside the globe; no lines on the sea
				float k = vH / 20.0;
				float fk = max(fwidth(k), 1e-4);
				float line = 1.0 - min(abs(fract(k - 0.5) - 0.5) / fk, 1.0);
				// where the 20 m lines crowd together on screen (steep ground), keep only the 100 m ones
				line *= 1.0 - smoothstep(0.25, 0.6, fk);
				float m = vH / 100.0;
				float major = 1.0 - min(abs(fract(m - 0.5) - 0.5) / max(fwidth(m), 1e-4), 1.0);
				float a = (line * 0.14 + major * 0.3) * f;
				if (a < 0.01) discard;
				gl_FragColor = vec4(0.36, 0.46, 0.56, a);
			}
		`
	});

	// ---- the map's lines beyond the rim: faint, at the ground's height -------------------------
	const lineGeo = new BufferGeometry();
	const lineMat = new ShaderMaterial({
		transparent: true,
		depthWrite: false,
		uniforms: { ...uniforms(), uDash: { value: R * 0.03 } },
		vertexShader: /* glsl */ `
			attribute vec4 aLook;
			attribute float aDash;
			attribute float aDist;
			varying vec4 vLook;
			varying float vDashed;
			varying float vDist;
			varying vec2 vXZ;
			varying float vH;
			void main() {
				vLook = aLook;
				vDashed = aDash;
				vDist = aDist;
				vXZ = position.xz;
				vH = position.y;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			${fade}
			uniform float uDash;
			varying vec4 vLook;
			varying float vDashed;
			varying float vDist;
			varying vec2 vXZ;
			varying float vH;
			void main() {
				float f = haloFade(vXZ, vH);
				if (f <= 0.001) discard;
				if (vDashed > 0.5 && fract(vDist / uDash) > 0.55) discard;
				gl_FragColor = vec4(vLook.rgb, vLook.a * f);
			}
		`
	});
	let builtLines: GlobeLine[] | undefined;

	/** Segments with both ends within reach, on the ground. */
	function buildLines() {
		const lp: number[] = [];
		const look: number[] = [];
		const dash: number[] = [];
		const dist: number[] = [];
		const reach = OUTER * 1.05;
		for (const line of lines) {
			const p = line.xy;
			const l = [...line.haloColor, line.haloAlpha];
			const d = line.dash ? 1 : 0;
			let along = 0;
			for (let k = 2; k < p.length; k += 2) {
				const seg = Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
				if (Math.hypot(p[k], p[k + 1]) < reach && Math.hypot(p[k - 2], p[k - 1]) < reach) {
					lp.push(p[k - 2], ground(p[k - 2], p[k - 1]) + 2, -p[k - 1], p[k], ground(p[k], p[k + 1]) + 2, -p[k + 1]);
					look.push(...l, ...l);
					dash.push(d, d);
					dist.push(along, along + seg);
				}
				along += seg;
			}
		}
		lineGeo.setAttribute('position', new BufferAttribute(new Float32Array(lp), 3));
		lineGeo.setAttribute('aLook', new BufferAttribute(new Float32Array(look), 4));
		lineGeo.setAttribute('aDash', new BufferAttribute(new Float32Array(dash), 1));
		lineGeo.setAttribute('aDist', new BufferAttribute(new Float32Array(dist), 1));
		lineGeo.computeBoundingSphere();
	}

	useTask(() => {
		if (lines !== builtLines) {
			builtLines = lines;
			buildLines();
		}
		for (const m of [surfaceMat, lineMat]) {
			m.uniforms.uBase.value = globe.base;
			m.uniforms.uOpen.value = open?.() ?? 1;
			m.uniforms.uClear.value = R * fogIn;
			m.uniforms.uFadeFrom.value = Math.max(R * fogIn + (OUTER - R * fogIn) * 0.25, OUTER * 0.7);
		}
	});

	$effect(() => () => {
		surface.dispose();
		surfaceMat.dispose();
		lineGeo.dispose();
		lineMat.dispose();
	});
</script>

{#if contours}<T.Mesh geometry={surface} material={surfaceMat} frustumCulled={false} renderOrder={1} />{/if}
{#if lines.length}<T.LineSegments geometry={lineGeo} material={lineMat} frustumCulled={false} renderOrder={1} />{/if}
