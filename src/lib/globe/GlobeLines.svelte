<!--
  The map's lines on the globe's landscape: roads (white, wider for bigger roads), rivers (blue)
  and park edges (dashed green), as flat ribbons laid on the land at its own heights. The shader
  trims them to the circle. Lives inside the group scaled on Y by the exaggeration.
-->
<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { BufferAttribute, BufferGeometry, DoubleSide, ShaderMaterial } from 'three';
	import type { GlobeLine } from './lines';
	import type { GlobeState } from './state';

	let { globe, radius, lines, fade }: { globe: GlobeState; radius: number; lines: GlobeLine[]; fade?: () => number } = $props();

	// svelte-ignore state_referenced_locally — a new radius remounts this component
	const LIFT = Math.max(1.5, radius / 1200);

	const geometry = new BufferGeometry();
	let built = -1;
	let builtLines: GlobeLine[] | undefined;

	/** Each line as a ribbon: two vertices per point, pushed out either side of the line. */
	function build() {
		const reach = globe.patch.reach;
		const pos: number[] = [];
		const col: number[] = [];
		const dist: number[] = [];
		const dash: number[] = [];
		const idx: number[] = [];
		const inside = (x: number, n: number) => Math.hypot(x, n) < reach;
		for (const line of lines) {
			const half = radius * line.half;
			const p = line.xy;
			const look = [...line.color, line.alpha];
			const dashed = line.dash ? 1 : 0;
			// consecutive points inside the reach make one strip
			let run: [number, number][] = [];
			const flush = () => {
				if (run.length > 1) {
					const start = pos.length / 3;
					let along = 0;
					run.forEach(([x, n], k) => {
						const [ax, an] = run[Math.max(0, k - 1)];
						const [bx, bn] = run[Math.min(run.length - 1, k + 1)];
						if (k) along += Math.hypot(x - run[k - 1][0], n - run[k - 1][1]);
						let dx = bx - ax;
						let dn = bn - an;
						const len = Math.hypot(dx, dn) || 1;
						dx /= len;
						dn /= len;
						const h = globe.ground(x, n) + LIFT;
						pos.push(x - dn * half, h, -(n + dx * half), x + dn * half, h, -(n - dx * half));
						col.push(...look, ...look);
						dash.push(dashed, dashed);
						dist.push(along, along);
						if (k > 0) {
							const q = start + (k - 1) * 2;
							idx.push(q, q + 1, q + 2, q + 2, q + 1, q + 3);
						}
					});
				}
				run = [];
			};
			for (let k = 0; k < p.length; k += 2) {
				if (inside(p[k], p[k + 1])) run.push([p[k], p[k + 1]]);
				else flush();
			}
			flush();
		}
		geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
		geometry.setAttribute('aLook', new BufferAttribute(new Float32Array(col), 4)); // r, g, b, alpha
		geometry.setAttribute('aDash', new BufferAttribute(new Float32Array(dash), 1));
		geometry.setAttribute('aDist', new BufferAttribute(new Float32Array(dist), 1));
		geometry.setIndex(idx);
		geometry.computeBoundingSphere();
	}

	const material = new ShaderMaterial({
		side: DoubleSide,
		transparent: true,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: -1,
		polygonOffsetUnits: -2,
		// svelte-ignore state_referenced_locally
		uniforms: { uR: { value: radius }, uDash: { value: radius * 0.02 }, uFade: { value: 1 } },
		vertexShader: /* glsl */ `
			attribute float aDist;
			attribute vec4 aLook;
			attribute float aDash;
			varying vec4 vLook;
			varying float vDashed;
			varying float vDist;
			varying vec2 vXZ;
			void main() {
				vLook = aLook;
				vDashed = aDash;
				vDist = aDist;
				vXZ = position.xz;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform float uFade;
			uniform float uR;
			uniform float uDash;
			varying vec4 vLook;
			varying float vDashed;
			varying float vDist;
			varying vec2 vXZ;
			void main() {
				if (length(vXZ) > uR - 2.0) discard;
				if (vDashed > 0.5 && fract(vDist / uDash) > 0.55) discard;
				gl_FragColor = vec4(vLook.rgb, vLook.a * uFade);
			}
		`
	});

	useTask(() => {
		material.uniforms.uFade.value = fade?.() ?? 1;
		if (globe.version !== built || lines !== builtLines) {
			built = globe.version;
			builtLines = lines;
			build();
		}
	});

	$effect(() => () => {
		geometry.dispose();
		material.dispose();
	});
</script>

<T.Mesh {geometry} {material} frustumCulled={false} renderOrder={2} />
