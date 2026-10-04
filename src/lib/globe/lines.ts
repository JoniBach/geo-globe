// The map's lines for the globe (roads, rivers, park edges), in one shape both the landscape
// (GlobeLines) and the surroundings beyond the rim (GlobeHalo) can draw: local x/n pairs plus how
// each should look. Colours are sRGB 0..1 (the globe's shaders write them as they are).
import type { MapData } from '$lib/osm';

export interface GlobeLine {
	/** local metres: x, n, x, n, … */
	xy: Float32Array;
	/** half-width on the land, as a share of the globe's radius */
	half: number;
	color: [number, number, number];
	alpha: number;
	/** how it shows beyond the rim */
	haloColor: [number, number, number];
	haloAlpha: number;
	dash: boolean;
}

// roads by tier: 0 major … 4 track
const ROAD_HALF = [0.0034, 0.0028, 0.0022, 0.0016, 0.0011];
const ROAD_ALPHA = [0.95, 0.9, 0.8, 0.6, 0.4];
const ROAD_HALO = [0.6, 0.5, 0.38, 0.25, 0.14];

export function globeLines(map: MapData, show: { roads: boolean; rivers: boolean; parks: boolean }): GlobeLine[] {
	const lines: GlobeLine[] = [];
	if (show.parks)
		for (const park of map.parks.filter((p) => p.national))
			for (const xy of park.edges)
				lines.push({ xy, half: 0.0013, color: [0.17, 0.55, 0.27], alpha: 0.75, haloColor: [0.17, 0.55, 0.27], haloAlpha: 0.35, dash: true });
	if (show.rivers)
		for (const xy of map.rivers) lines.push({ xy, half: 0.0017, color: [0.42, 0.66, 0.86], alpha: 0.9, haloColor: [0.42, 0.62, 0.8], haloAlpha: 0.35, dash: false });
	if (show.roads)
		// minor roads first, so the main roads draw over them where they meet
		for (const road of [...map.roads].sort((a, b) => b.tier - a.tier)) {
			const t = road.tier;
			lines.push({
				xy: road.xy,
				half: ROAD_HALF[t],
				color: [1, 0.99, 0.96],
				alpha: ROAD_ALPHA[t],
				haloColor: [0.47, 0.49, 0.52],
				haloAlpha: ROAD_HALO[t],
				dash: false
			});
		}
	return lines;
}
