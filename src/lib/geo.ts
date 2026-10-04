// Coordinates. Every source speaks longitude/latitude (or Web Mercator tiles, which are just
// another way of writing them); the 3D scene wants metres. Around one place, a flat "local"
// plane in metres is plenty accurate: a few km out, Earth's curve moves things by centimetres.
//
//   x: metres east of the centre        n: metres north of the centre
//   scene: (x, height, -n)  (three.js: y up, and north is -z: the far side as the globe opens)

const RAD = Math.PI / 180;
/** metres per degree of latitude (and of longitude at the equator) */
const M_PER_DEG = 111_320;

export interface LonLat {
	lon: number;
	lat: number;
}

/** A flat world in metres centred on a place: x east, n north. */
export function localPlane(centre: LonLat) {
	const kx = M_PER_DEG * Math.cos(centre.lat * RAD);
	return {
		toLocal: (lon: number, lat: number): [number, number] => [(lon - centre.lon) * kx, (lat - centre.lat) * M_PER_DEG],
		toLonLat: (x: number, n: number): [number, number] => [centre.lon + x / kx, centre.lat + n / M_PER_DEG]
	};
}
export type LocalPlane = ReturnType<typeof localPlane>;

// ---- Web Mercator tiles (slippy map: z/x/y) --------------------------------------------------

/** fractional tile x at zoom z */
export const mercX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
/** fractional tile y at zoom z (0 at the top, ~85° N) */
export const mercY = (lat: number, z: number) => {
	const s = Math.sin(lat * RAD);
	return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z;
};
/** fractional tile coords -> lon/lat */
export const tileToLonLat = (tx: number, ty: number, z: number): [number, number] => {
	const lon = (tx / 2 ** z) * 360 - 180;
	const m = Math.PI * (1 - (2 * ty) / 2 ** z);
	return [lon, Math.atan(Math.sinh(m)) / RAD];
};

/** Width of one tile at zoom z, in metres, at this latitude. */
export const tileMetres = (z: number, lat: number) => (2 * Math.PI * 6378137 * Math.cos(lat * RAD)) / 2 ** z;

/** Every tile at zoom z within `reach` metres of the centre (a square around it). */
export function tilesAround(centre: LonLat, reach: number, z: number): [number, number][] {
	const plane = localPlane(centre);
	const [w, nTop] = plane.toLonLat(-reach, reach);
	const [e, s] = plane.toLonLat(reach, -reach);
	const out: [number, number][] = [];
	for (let x = Math.floor(mercX(w, z)); x <= Math.floor(mercX(e, z)); x++)
		for (let y = Math.floor(mercY(nTop, z)); y <= Math.floor(mercY(s, z)); y++) out.push([x, y]);
	return out;
}

/** The deepest zoom (up to `max`) at which `reach` metres either side fits in about `across` tiles. */
export function zoomFor(reach: number, lat: number, across: number, max: number, min = 3) {
	for (let z = max; z > min; z--) if (tileMetres(z, lat) * (across - 1) >= reach * 2) return z;
	return min;
}

/** "53.0685° N, 4.0763° W" */
export const formatLonLat = ({ lon, lat }: LonLat, digits = 4) =>
	`${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(digits)}° ${lon >= 0 ? 'E' : 'W'}`;
