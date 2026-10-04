// Map data from OpenStreetMap, as vector tiles from OpenFreeMap (OpenMapTiles schema, free, no
// key). A vector tile is a small protobuf of shapes in tile coordinates (0..4096 across), grouped
// in layers: "transportation" (roads), "waterway" (rivers), "water" (lakes, sea), "park",
// "place" (towns, villages), "mountain_peak", "water_name"…  Decoded here into local metres.
import { VectorTile, classifyRings, type VectorTileFeature } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { localPlane, tileToLonLat, tilesAround, type LonLat } from './geo';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
export const OSM_ATTRIBUTION = '© OpenMapTiles © OpenStreetMap contributors';

export interface Road {
	/** 0 major … 4 track */
	tier: number;
	/** local metres: x, n, x, n, … */
	xy: Float32Array;
}
export interface Park {
	name: string;
	/** a national park (rather than a smaller reserve): its edge is drawn, and it's named on the card */
	national: boolean;
	/** its outline, without the cuts where tiles clipped it */
	edges: Float32Array[];
	/** filled polygons (rings, outer first): for "is this point in the park?" */
	polygons: Float32Array[][];
}
export interface Place {
	kind: 'town' | 'village' | 'hamlet' | 'locality' | 'peak' | 'water';
	name: string;
	x: number;
	n: number;
	ele?: number;
}
export interface MapData {
	roads: Road[];
	rivers: Float32Array[];
	parks: Park[];
	places: Place[];
	/** 0..1: how much of the ground at local (x, n) is water (lakes, reservoirs, sea, wide rivers) */
	waterAt: (x: number, n: number) => number;
}

// OpenMapTiles transportation class -> draw tier
const TIER: Record<string, number> = { motorway: 0, trunk: 0, primary: 0, secondary: 1, tertiary: 1, minor: 2, service: 3, track: 4 };
const PLACE_KIND: Record<string, Place['kind']> = {
	city: 'town',
	town: 'town',
	village: 'village',
	hamlet: 'hamlet',
	suburb: 'hamlet',
	isolated_dwelling: 'locality',
	locality: 'locality',
	neighbourhood: 'locality'
};
// Protected areas are tagged unevenly across countries: Eryri (Snowdonia) National Park comes as
// "conservation", while "national_park" also holds small nature reserves. So keep them all, and
// call a park national by its class *or* its name, in a few languages.
const PARK_CLASSES = new Set(['national_park', 'conservation', 'protected_area', 'nature_reserve']);
const NATIONAL =
	/national\s*park|parc\s+cenedlaethol|nationalpark|parc\s+national|parque\s+nacional|parco\s+nazionale|park\s+narodowy|národní\s+park|nationaal\s+park|kansallispuisto|nasjonalpark/i;

let template: Promise<string> | null = null;
/** The current planet tile URL (versioned), from OpenFreeMap's TileJSON. */
const tileUrl = () =>
	(template ??= fetch(TILEJSON)
		.then((r) => r.json())
		.then((tj) => tj.tiles[0] as string));

const cache = new Map<string, Promise<VectorTile | null>>();
function tile(z: number, x: number, y: number) {
	const key = `${z}/${x}/${y}`;
	let t = cache.get(key);
	if (!t) {
		t = tileUrl()
			.then((u) => fetch(u.replace('{z}', `${z}`).replace('{x}', `${x}`).replace('{y}', `${y}`)))
			.then(async (r) => (r.ok && r.status !== 204 ? new VectorTile(new PbfReader(new Uint8Array(await r.arrayBuffer()))) : null))
			.catch(() => null);
		cache.set(key, t);
		if (cache.size > 300) cache.delete(cache.keys().next().value!);
	}
	return t;
}

/** a point in tile coordinates (0..extent) */
type Pt = ReturnType<VectorTileFeature['loadGeometry']>[number][number];

/** Read the tiles within `reach` at zoom z; `visit` gets each feature with a tile-point → local converter. */
async function readTiles(
	centre: LonLat,
	reach: number,
	z: number,
	layers: string[],
	visit: (layer: string, props: Record<string, unknown>, type: number, rings: Pt[][], toLocal: (p: Pt) => [number, number], extent: number) => void
) {
	const plane = localPlane(centre);
	const list = tilesAround(centre, reach, z);
	const vts = await Promise.all(list.map(([x, y]) => tile(z, x, y)));
	vts.forEach((vt, k) => {
		if (!vt) return;
		const [tx, ty] = list[k];
		for (const name of layers) {
			const layer = vt.layers[name];
			if (!layer) continue;
			const E = layer.extent;
			const toLocal = (p: Pt) => plane.toLocal(...tileToLonLat(tx + p.x / E, ty + p.y / E, z));
			for (let i = 0; i < layer.length; i++) {
				const f = layer.feature(i);
				visit(name, f.properties as Record<string, unknown>, f.type, f.loadGeometry(), toLocal, E);
			}
		}
	});
	return plane;
}

const flat = (pts: [number, number][]) => Float32Array.from(pts.flat());

/**
 * A shape's outline without the straight cuts along tile edges (tiles clip polygons, a little
 * outside their own square): a dashed park edge shouldn't trace the tile grid.
 */
function realEdges(ring: Pt[], E: number, toLocal: (p: Pt) => [number, number]) {
	const runs: Float32Array[] = [];
	let run: [number, number][] = [];
	const cut = (a: Pt, b: Pt) => (a.x === b.x && (a.x <= 0 || a.x >= E)) || (a.y === b.y && (a.y <= 0 || a.y >= E));
	for (let k = 1; k < ring.length; k++) {
		if (cut(ring[k - 1], ring[k])) {
			if (run.length > 1) runs.push(flat(run));
			run = [];
			continue;
		}
		if (!run.length) run.push(toLocal(ring[k - 1]));
		run.push(toLocal(ring[k]));
	}
	if (run.length > 1) runs.push(flat(run));
	return runs;
}

/** Water drawn into a canvas over the land, then sampled: a mask the land's shader can use. */
function waterMask(polys: [number, number][][][], reach: number) {
	const S = 1024;
	const canvas = new OffscreenCanvas(S, S);
	const ctx = canvas.getContext('2d')!;
	const k = S / (2 * reach);
	ctx.fillStyle = '#fff';
	for (const poly of polys) {
		ctx.beginPath();
		for (const ring of poly) ring.forEach(([x, n], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (x + reach) * k, (reach - n) * k));
		ctx.fill('evenodd'); // holes (islands) stay land
	}
	const px = ctx.getImageData(0, 0, S, S).data;
	return (x: number, n: number) => {
		const c = Math.floor((x + reach) * k);
		const r = Math.floor((reach - n) * k);
		return c < 0 || r < 0 || c >= S || r >= S ? 0 : px[(r * S + c) * 4 + 3] / 255;
	};
}

/**
 * The map around a place: everything within `near` metres (the land on the globe), and the main
 * roads, rivers and park edges out to `far` (the surroundings beyond its rim).
 */
export async function mapAround(centre: LonLat, near: number, far: number): Promise<MapData> {
	const roads: Road[] = [];
	const rivers: Float32Array[] = [];
	const parks = new Map<string, Park>();
	const places = new Map<string, Place>();
	const water: [number, number][][][] = [];

	// the land: as sharp as there's data for (z14), or z13 for big globes; the surroundings coarser
	const zNear = near <= 2600 ? 14 : 13;
	const zFar = far <= 9000 ? 12 : far <= 20000 ? 11 : 10;
	const inReach = (reach: number) => (pts: [number, number][]) => pts.some(([x, n]) => Math.abs(x) < reach && Math.abs(n) < reach);

	const band = (reach: number, z: number, detail: boolean) =>
		readTiles(
			centre,
			reach,
			z,
			detail ? ['transportation', 'waterway', 'water', 'park', 'place', 'mountain_peak', 'water_name'] : ['transportation', 'waterway', 'park'],
			(layer, p, type, rings, toLocal, E) => {
				const within = inReach(reach);
				if (layer === 'transportation' && type === 2) {
					const tier = TIER[p.class as string];
					// tunnels are underground; beyond the land only the main roads
					if (tier === undefined || p.brunnel === 'tunnel' || (!detail && tier > 1)) return;
					for (const line of rings) {
						const pts = line.map(toLocal);
						// the far band skips what the near band has in detail
						if (within(pts) && (detail || !pts.every(([x, n]) => Math.hypot(x, n) < near))) roads.push({ tier, xy: flat(pts) });
					}
				} else if (layer === 'waterway' && type === 2) {
					if (p.class !== 'river' && p.class !== 'canal') return;
					for (const line of rings) {
						const pts = line.map(toLocal);
						if (within(pts) && (detail || !pts.every(([x, n]) => Math.hypot(x, n) < near))) rivers.push(flat(pts));
					}
				} else if (layer === 'water' && type === 3) {
					if (p.class === 'swimming_pool') return;
					for (const poly of classifyRings(rings)) water.push(poly.map((ring) => ring.map(toLocal)));
				} else if (layer === 'park' && type === 3) {
					const name = (p['name:en'] ?? p['name:latin'] ?? p.name) as string | undefined;
					if (!PARK_CLASSES.has(p.class as string) || !name) return;
					const names = `${name} ${p.name ?? ''}`;
					// ("national_park" also holds nature reserves: Gwarchodfa Natur Genedlaethol is one)
					const national = NATIONAL.test(names) || (p.class === 'national_park' && !/reserve|natur|gwarchodfa/i.test(names));
					const park = parks.get(name) ?? { name, national, edges: [], polygons: [] };
					parks.set(name, park);
					for (const poly of classifyRings(rings)) {
						park.polygons.push(poly.map((ring) => flat(ring.map(toLocal))));
						for (const ring of poly) park.edges.push(...realEdges(ring, E, toLocal));
					}
				} else if (type === 1 && (layer === 'place' || layer === 'mountain_peak' || layer === 'water_name')) {
					const kind = layer === 'place' ? PLACE_KIND[p.class as string] : layer === 'mountain_peak' ? 'peak' : 'water';
					const name = (p['name:latin'] ?? p.name) as string | undefined;
					if (!kind || !name) return;
					if (layer === 'mountain_peak' && p.class !== 'peak' && p.class !== 'volcano') return;
					const [x, n] = toLocal(rings[0][0]);
					// tiles overlap a little: the same place can come from two of them
					const key = `${kind}:${name}:${Math.round(x / 200)}:${Math.round(n / 200)}`;
					if (!places.has(key)) places.set(key, { kind, name, x, n, ele: typeof p.ele === 'number' ? p.ele : undefined });
				}
			}
		);

	await Promise.all([band(near, zNear, true), band(far, zFar, false)]);
	return { roads, rivers, parks: [...parks.values()], places: [...places.values()], waterAt: waterMask(water, near) };
}

/** Which national park (if any) a local point is in: one named a national park first. */
export function parkAt(parks: Park[], x: number, n: number): string | null {
	const inRing = (ring: Float32Array) => {
		let inside = false;
		for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
			const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
			if (yi > n !== yj > n && x < ((xj - xi) * (n - yi)) / (yj - yi) + xi) inside = !inside;
		}
		return inside;
	};
	const inside = (park: Park) => park.polygons.some(([outer, ...holes]) => inRing(outer) && !holes.some(inRing));
	const candidates = parks.filter((p) => p.national && inside(p));
	return (candidates.find((p) => NATIONAL.test(p.name)) ?? candidates[0])?.name ?? null;
}

