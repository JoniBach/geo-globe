<!--
  Names on the globe from OpenStreetMap: peaks (with their height), lakes, towns, villages and
  hamlets, as HTML labels pinned to points in the 3D scene. At most a handful, most important
  first, so a big globe doesn't become a word cloud.
  Lives in the land's group (local metres, exaggerated y).
-->
<script lang="ts">
	import { HTML } from '@threlte/extras';
	import type { Place } from '$lib/osm';
	import type { GlobeState } from './state';

	let { globe, radius, places, exaggeration }: { globe: GlobeState; radius: number; places: Place[]; exaggeration: number } = $props();

	/** at most this many names at once (fewer on a phone) */
	const MAX = (globalThis.innerWidth ?? 1000) < 600 ? 8 : 14;
	// most important first: towns, lakes, villages, peaks by height, then the small places
	const rank = (p: Place) => ({ town: 5000, water: 4000, village: 3000, peak: 1000 + (p.ele ?? 0), hamlet: 500, locality: 0 })[p.kind];

	const shown = $derived.by(() => {
		// small localities only on small globes, where there's room for them
		const kinds = new Set<Place['kind']>(['town', 'village', 'hamlet', 'peak', 'water', ...(radius <= 2500 ? (['locality'] as const) : [])]);
		const lim = radius * 0.92;
		return places
			.filter((p) => kinds.has(p.kind) && Math.hypot(p.x, p.n) < lim)
			.sort((a, b) => rank(b) - rank(a))
			.slice(0, MAX)
			.map((p) => ({ key: `${p.kind}${p.name}${Math.round(p.x)}`, p, h: globe.ground(p.x, p.n) }));
	});

	const lift = $derived(radius * 0.012);
</script>

{#each shown as l (l.key)}
	<HTML position={[l.p.x, l.h * exaggeration + lift, -l.p.n]} center pointerEvents="none" zIndexRange={[30, 0]}>
		<span class="gl {l.p.kind}" aria-hidden="true">
			{#if l.p.kind === 'peak'}<span class="tri">▲</span>{/if}{l.p.name}{#if l.p.kind === 'peak' && l.p.ele}<small>{' '}{l.p.ele} m</small>{/if}
		</span>
	</HTML>
{/each}

<style>
	.gl {
		/* labels arrive softly once the land has risen, not all at once */
		animation: appear 0.7s ease backwards;
		display: block;
		white-space: nowrap;
		font: 500 11px/1.2 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
		letter-spacing: 0.04em;
		color: #3a3128;
		text-shadow:
			0 0 3px #fffaf2,
			0 0 6px #fffaf2,
			0 0 10px rgb(255 250 242 / 0.8);
		transform: translateY(-10px);
	}
	.town,
	.village {
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
	.hamlet {
		font-size: 11px;
	}
	.locality {
		font-size: 10px;
		font-style: italic;
		color: #5c5247;
	}
	.water {
		font-size: 12px;
		font-style: italic;
		letter-spacing: 0.12em;
		color: #245a80;
	}
	.peak {
		font-size: 11px;
		font-weight: 600;
		color: #5a3f22;
	}
	.tri {
		margin-right: 3px;
		font-size: 9px;
	}
	small {
		font-weight: 400;
		color: #7a6147;
	}
	@keyframes appear {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.gl {
			animation-duration: 0.2s;
		}
	}
</style>
