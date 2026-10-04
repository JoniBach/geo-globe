<!--
  Paces the globe's frame loop so it only works as hard as what's on screen needs: full speed
  while you're turning or zooming it and while one place gives way to the next; the day playing at
  30 fps on phones and 60 elsewhere; and about 15 fps when nothing's happening, which is
  plenty for drifting clouds. Everything animates by elapsed time, so a lower rate changes
  smoothness, never speed. Replaces the renderer's animation loop (Threlte runs its scheduler
  from it) with one that skips frames.
-->
<script lang="ts" module>
	/** until when (performance.now) the globe should run at full speed: transitions set it */
	export const pace = { busyUntil: 0 };
	/** keep full speed for the next `ms` */
	export const busy = (ms = 250) => (pace.busyUntil = Math.max(pace.busyUntil, performance.now() + ms));
</script>

<script lang="ts">
	import { useThrelte } from '@threlte/core';
	import { onMount } from 'svelte';

	let { playing }: { playing: () => boolean } = $props();
	const { renderer, scheduler, dom } = useThrelte();

	const phone = matchMedia('(max-width: 900px), (pointer: coarse)').matches;

	onMount(() => {
		// any touch, drag or wheel on the globe: full speed while it (and the controls' damping) settles
		const touch = () => busy(1500);
		const events = ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'touchmove'] as const;
		for (const e of events) dom.addEventListener(e, touch, { passive: true });

		let last = -Infinity;
		renderer.setAnimationLoop((time) => {
			const now = performance.now();
			const fps = now < pace.busyUntil ? 0 : playing() ? (phone ? 30 : 60) : 15;
			// 0: every frame the display offers (144 Hz screens included); otherwise skip until the next slot is due
			if (fps && time - last < 1000 / fps - 3) return;
			last = time;
			scheduler.run(time);
		});
		return () => {
			for (const e of events) dom.removeEventListener(e, touch);
		};
	});
</script>
