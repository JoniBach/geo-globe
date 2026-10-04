// Where the sun and moon are in the sky for a place and moment (low-precision formulas, the same
// family suncalc uses: good to a fraction of a degree, plenty for a diorama), and the colours of
// the light and the sky that follow from the sun's height.
import { interpolateRgb } from 'd3-interpolate';

const RAD = Math.PI / 180;
const E = RAD * 23.4397; // obliquity of the ecliptic

export interface SkyBody {
	/** radians above the horizon (negative = below) */
	alt: number;
	/** radians clockwise from north */
	az: number;
}

const daysSinceJ2000 = (epochSec: number) => epochSec / 86400 - 10957.5;
const siderealTime = (d: number, lonRad: number) => RAD * (280.16 + 360.9856235 * d) + lonRad;

function horizon(ra: number, dec: number, d: number, lat: number, lon: number): SkyBody {
	const H = siderealTime(d, lon * RAD) - ra;
	const phi = lat * RAD;
	const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
	// from south, westward -> from north, clockwise
	const azS = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
	return { alt, az: azS + Math.PI };
}

export function sunAt(epochSec: number, lat: number, lon: number): SkyBody {
	const d = daysSinceJ2000(epochSec);
	const M = RAD * (357.5291 + 0.98560028 * d);
	const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
	const L = M + C + RAD * 102.9372 + Math.PI; // ecliptic longitude
	const ra = Math.atan2(Math.sin(L) * Math.cos(E), Math.cos(L));
	const dec = Math.asin(Math.sin(E) * Math.sin(L));
	return horizon(ra, dec, d, lat, lon);
}

export function moonAt(epochSec: number, lat: number, lon: number): SkyBody {
	const d = daysSinceJ2000(epochSec);
	const L = RAD * (218.316 + 13.176396 * d);
	const M = RAD * (134.963 + 13.064993 * d);
	const F = RAD * (93.272 + 13.22935 * d);
	const l = L + RAD * 6.289 * Math.sin(M);
	const b = RAD * 5.128 * Math.sin(F);
	const ra = Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
	const dec = Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
	return horizon(ra, dec, d, lat, lon);
}

/** Unit vector towards a sky body in the scene (x east, y up, z south: north is -z). */
export function direction(b: SkyBody): [number, number, number] {
	return [Math.sin(b.az) * Math.cos(b.alt), Math.sin(b.alt), -Math.cos(b.az) * Math.cos(b.alt)];
}

// ---- colours by the sun's height (degrees) ---------------------------------------------------

type Stop = { at: number; top: string; bottom: string; light: string };
// night · blue hour · golden hour · day: soft and light throughout, never the 3D view's black
const STOPS: Stop[] = [
	{ at: -14, top: '#1d2748', bottom: '#3d4c72', light: '#8fa6d8' },
	{ at: -5, top: '#40558a', bottom: '#d9a2a0', light: '#c9b3d6' },
	{ at: 1, top: '#7fa6d4', bottom: '#f6c49b', light: '#ffc58a' },
	{ at: 10, top: '#a9d0f0', bottom: '#f7e6cf', light: '#fff0d8' },
	{ at: 30, top: '#bfe1f7', bottom: '#f3f8fb', light: '#ffffff' }
];

function band(deg: number) {
	if (deg <= STOPS[0].at) return { a: STOPS[0], b: STOPS[0], f: 0 };
	for (let k = 0; k < STOPS.length - 1; k++)
		if (deg <= STOPS[k + 1].at) return { a: STOPS[k], b: STOPS[k + 1], f: (deg - STOPS[k].at) / (STOPS[k + 1].at - STOPS[k].at) };
	const last = STOPS[STOPS.length - 1];
	return { a: last, b: last, f: 0 };
}

/**
 * Sky gradient and light colour for a sun height, greyed by cloud (0..1) and darkened a little
 * by rain (0..1).
 */
export function skyColours(sunAltRad: number, cloud: number, rain: number) {
	const { a, b, f } = band(sunAltRad / RAD);
	// overcast greys the daytime sky; at night it would only brighten it, so fade it out
	const daylight = Math.max(0.15, Math.min(1, (sunAltRad / RAD + 8) / 14));
	const grey = Math.min(0.75, cloud * 0.55 + rain * 0.25) * daylight;
	const mix = (x: string, y: string, overcast: string) => interpolateRgb(interpolateRgb(x, y)(f), overcast)(grey);
	return {
		top: mix(a.top, b.top, '#aeb8c2'),
		bottom: mix(a.bottom, b.bottom, '#d7dce0'),
		light: interpolateRgb(a.light, b.light)(f)
	};
}
