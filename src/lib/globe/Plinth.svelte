<!--
  The globe's base: a pale plinth whose top is the landscape's floor (scene y = 0), an engraved
  compass ring around the land (north is always -z, the far side as the globe first appears),
  the place's name and coordinates lettered around the front, and a soft shadow underneath.
-->
<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { CanvasTexture, CylinderGeometry, MeshStandardMaterial, RingGeometry, SRGBColorSpace } from 'three';

	let {
		R,
		title,
		date,
		shadow,
		lettering
	}: {
		R: number;
		title: string;
		date: string;
		shadow: number;
		/** how visible the lettering is, 0 to 1 (the stage fades it out and back in between places) */
		lettering?: () => number;
	} = $props();

	// svelte-ignore state_referenced_locally — the size is fixed for the component's lifetime
	const OUT = R * 1.13;
	// svelte-ignore state_referenced_locally
	const H = R * 0.1;
	const CREAM = '#f1ebe0';
	const INK = 'rgba(92, 76, 60, 0.85)';
	const LIGHT = 'rgba(255, 255, 255, 0.7)';
	const FONT = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

	/** Text cut into the surface: a dark stroke with a light edge below it. */
	function engrave(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
		ctx.fillStyle = LIGHT;
		ctx.fillText(text, x, y + 2);
		ctx.fillStyle = INK;
		ctx.fillText(text, x, y);
	}

	function compass() {
		const S = 2048;
		const c = document.createElement('canvas');
		c.width = c.height = S;
		const ctx = c.getContext('2d')!;
		const mid = S / 2;
		const k = mid / OUT; // px per metre
		const inner = R * k;
		ctx.fillStyle = CREAM;
		ctx.beginPath();
		ctx.arc(mid, mid, mid, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = INK;
		ctx.lineCap = 'round';
		// ticks: every 5°, longer every 15°, longest at the eight points
		for (let deg = 0; deg < 360; deg += 5) {
			const a = (deg * Math.PI) / 180;
			const len = deg % 45 === 0 ? 34 : deg % 15 === 0 ? 20 : 11;
			ctx.lineWidth = deg % 45 === 0 ? 4 : 2;
			const r1 = mid - 8;
			const [sx, sy] = [Math.sin(a), -Math.cos(a)]; // clockwise from north (canvas up)
			ctx.beginPath();
			ctx.moveTo(mid + sx * r1, mid + sy * r1);
			ctx.lineTo(mid + sx * (r1 - len), mid + sy * (r1 - len));
			ctx.stroke();
		}
		// a fine double line along the land's edge
		ctx.lineWidth = 2;
		for (const r of [inner + 6, inner + 12]) {
			ctx.beginPath();
			ctx.arc(mid, mid, r, 0, Math.PI * 2);
			ctx.stroke();
		}
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const rText = (inner + mid - 40) / 2 + 6;
		const points: [string, number, number][] = [
			['N', 0, 64],
			['NE', 45, 34],
			['E', 90, 56],
			['SE', 135, 34],
			['S', 180, 56],
			['SW', 225, 34],
			['W', 270, 56],
			['NW', 315, 34]
		];
		for (const [label, deg, size] of points) {
			const a = (deg * Math.PI) / 180;
			ctx.save();
			ctx.translate(mid + Math.sin(a) * rText, mid - Math.cos(a) * rText);
			ctx.rotate(a); // letters stand with their tops to the rim
			ctx.font = `${deg % 90 === 0 ? 700 : 500} ${size}px ${FONT}`;
			engrave(ctx, label, 0, 0);
			ctx.restore();
		}
		const t = new CanvasTexture(c);
		t.colorSpace = SRGBColorSpace;
		t.anisotropy = 8;
		return t;
	}

	/** the side: cream with a thin moulding at top and bottom (the lettering is a layer over it) */
	function side() {
		const W = 1024;
		const Hpx = 256;
		const c = document.createElement('canvas');
		c.width = W;
		c.height = Hpx;
		const ctx = c.getContext('2d')!;
		ctx.fillStyle = CREAM;
		ctx.fillRect(0, 0, W, Hpx);
		ctx.fillStyle = 'rgba(92, 76, 60, 0.25)';
		ctx.fillRect(0, 14, W, 3);
		ctx.fillRect(0, Hpx - 17, W, 3);
		const t = new CanvasTexture(c);
		t.colorSpace = SRGBColorSpace;
		return t;
	}

	/** the lettering alone, on transparent, so it can fade */
	function band(label: string) {
		const W = 4096;
		const Hpx = 256;
		const c = document.createElement('canvas');
		c.width = W;
		c.height = Hpx;
		const ctx = c.getContext('2d')!;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = `600 64px ${FONT}`;
		// centred on the front (u = 0.5 faces south, towards the viewer)
		engrave(ctx, label, W / 2, Hpx / 2);
		const t = new CanvasTexture(c);
		t.colorSpace = SRGBColorSpace;
		t.anisotropy = 8;
		return t;
	}

	function shadowTex() {
		const c = document.createElement('canvas');
		c.width = c.height = 256;
		const ctx = c.getContext('2d')!;
		const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 128);
		g.addColorStop(0, 'rgba(40, 45, 60, 0.55)');
		g.addColorStop(1, 'rgba(40, 45, 60, 0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 256, 256);
		return new CanvasTexture(c);
	}

	/** the plinth's floor under the land: its own stone, a little shaded towards the rim like a shallow tray */
	function floorTex() {
		const S = 512;
		const c = document.createElement('canvas');
		c.width = c.height = S;
		const ctx = c.getContext('2d')!;
		const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
		g.addColorStop(0, '#ece5d8');
		g.addColorStop(0.75, '#e6dfd1');
		g.addColorStop(1, '#d3cabb');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, S, S);
		const t = new CanvasTexture(c);
		t.colorSpace = SRGBColorSpace;
		return t;
	}

	const ringTex = compass();
	const floor = floorTex();
	const sideTex = side();
	const letters = new MeshStandardMaterial({ transparent: true, roughness: 0.85, emissive: '#ffffff', emissiveIntensity: 0.35, depthWrite: false });
	$effect(() => {
		letters.map = bandTex;
		letters.emissiveMap = bandTex;
		letters.needsUpdate = true;
	});
	useTask(() => {
		letters.opacity = Math.min(1, Math.max(0, lettering?.() ?? 1));
	});
	const shadeTex = shadowTex();
	const label = $derived(`${title.toUpperCase()}   ·   ${date.toUpperCase()}`);
	const bandTex = $derived(band(label));
	$effect(() => {
		const t = bandTex;
		return () => t.dispose();
	});

	// u = 0.5 at the front: start the side's texture seam at the back
	// svelte-ignore state_referenced_locally
	const body = new CylinderGeometry(OUT, OUT * 1.03, H, 160, 1, true, Math.PI);
	// svelte-ignore state_referenced_locally
	const cap = new RingGeometry(R * 0.98, OUT, 160);

	$effect(() => () => {
		ringTex.dispose();
		floor.dispose();
		sideTex.dispose();
		letters.dispose();
		shadeTex.dispose();
		body.dispose();
		cap.dispose();
	});
</script>

<!-- side, and the lettering over it (its own layer, so it can fade between places) -->
<T.Mesh geometry={body} position.y={-H / 2}>
	<T.MeshStandardMaterial map={sideTex} emissiveMap={sideTex} emissive="#ffffff" emissiveIntensity={0.35} roughness={0.85} />
</T.Mesh>
<T.Mesh geometry={body} position.y={-H / 2} scale={[1.002, 1, 1.002]} material={letters} renderOrder={1} />
<!-- the compass ring, flat on top (rotated so the texture's up is north) -->
<T.Mesh geometry={cap} rotation.x={-Math.PI / 2} position.y={0.5}>
	<T.MeshStandardMaterial map={ringTex} emissiveMap={ringTex} emissive="#ffffff" emissiveIntensity={0.35} roughness={0.8} />
</T.Mesh>
<!-- the floor under the land (seen only while one place's land gives way to the next) -->
<T.Mesh rotation.x={-Math.PI / 2} position.y={-R * 0.012}>
	<T.CircleGeometry args={[R * 0.99, 160]} />
	<T.MeshStandardMaterial map={floor} emissiveMap={floor} emissive="#ffffff" emissiveIntensity={0.5} roughness={0.8} />
</T.Mesh>
<!-- underside -->
<T.Mesh rotation.x={Math.PI / 2} position.y={-H}>
	<T.CircleGeometry args={[OUT * 1.03, 96]} />
	<T.MeshStandardMaterial color="#d9d1c3" />
</T.Mesh>
<!-- soft shadow on the air below: grounds it without a table -->
<T.Mesh rotation.x={-Math.PI / 2} position.y={-H - R * 0.05}>
	<T.PlaneGeometry args={[OUT * 3.2, OUT * 3.2]} />
	<T.MeshBasicMaterial map={shadeTex} transparent opacity={shadow} depthWrite={false} />
</T.Mesh>
