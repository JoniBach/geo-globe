// Finding a place: typed coordinates, or a name looked up with Photon (komoot's OpenStreetMap
// geocoder: free, no key, and made for search-as-you-type).
import type { LonLat } from './geo';

export const SEARCH_ATTRIBUTION = 'Search by Photon (komoot), © OpenStreetMap contributors';

export interface Found extends LonLat {
	name: string;
	/** where it is, to tell places with the same name apart: "Gwynedd, United Kingdom" */
	detail: string;
	kind: string;
}

/**
 * Coordinates as people type them: "53.068, -4.076", "53.068 -4.076",
 * "53.068° N 4.076° W", "N53.068 W4.076". Latitude first. Null if it isn't coordinates.
 */
export function parseCoordinates(text: string): LonLat | null {
	const t = text.trim().toUpperCase().replace(/°/g, ' ');
	const m = /^([NS])?\s*(-?\d+(?:\.\d+)?)\s*([NS])?\s*[,;\s]\s*([EW])?\s*(-?\d+(?:\.\d+)?)\s*([EW])?$/.exec(t);
	if (!m) return null;
	let lat = +m[2];
	let lon = +m[5];
	if ((m[1] ?? m[3]) === 'S') lat = -Math.abs(lat);
	if ((m[4] ?? m[6]) === 'W') lon = -Math.abs(lon);
	if (Math.abs(lat) > 85 || Math.abs(lon) > 180) return null; // Web Mercator stops at ~85°
	return { lon, lat };
}

/** Places matching a name, best first. */
export async function searchPlaces(q: string, signal?: AbortSignal): Promise<Found[]> {
	const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`, { signal });
	if (!r.ok) return [];
	const j = await r.json();
	return (j.features ?? []).map((f: { properties: Record<string, string>; geometry: { coordinates: [number, number] } }) => {
		const p = f.properties;
		const [lon, lat] = f.geometry.coordinates;
		return {
			name: p.name ?? p.city ?? p.county ?? q,
			detail: [p.city !== p.name ? p.city : null, p.county, p.state, p.country].filter(Boolean).join(', '),
			kind: (p.osm_value ?? '').replace(/_/g, ' '),
			lon,
			lat
		};
	});
}

/** A few places worth seeing, for a first click. */
export const SUGGESTIONS: (LonLat & { name: string })[] = [
	{ name: 'Yr Wyddfa (Snowdon)', lat: 53.0685, lon: -4.0763 },
	{ name: 'Helvellyn', lat: 54.5272, lon: -3.0164 },
	{ name: 'Ben Nevis', lat: 56.7969, lon: -5.0036 },
	{ name: 'Matterhorn', lat: 45.9763, lon: 7.6586 },
	{ name: 'Grand Canyon', lat: 36.0997, lon: -112.1124 },
	{ name: 'Mount Fuji', lat: 35.3606, lon: 138.7274 }
];
