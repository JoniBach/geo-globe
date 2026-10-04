// Elevation for anywhere on Earth: Terrarium tiles (AWS open data, Mapzen's format, CORS open,
// no key). Each tile is a 256 × 256 PNG whose pixels *encode heights*, not colours:
//
//   height (m) = R × 256 + G + B / 256 − 32768
//
// Decoded here straight from the PNG bytes rather than through an <img> and a canvas: browsers may
// colour-manage images on their way into a canvas (Safari, wide-gamut screens), and one step off
// in the red channel is 256 m: needles and pits all over the landscape.
import { localPlane, mercX, mercY, tilesAround, type LonLat } from './geo';

const URL_OF = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

type Tile = Float32Array | null; // null = failed (open sea at some zooms, or offline): don't retry forever
const tiles = new Map<string, Tile | Promise<Tile>>();
/** decoded tiles kept (256 KB each) */
const MAX_TILES = 96;

function trim() {
	for (const [key, t] of tiles) {
		if (tiles.size <= MAX_TILES) break;
		if (!(t instanceof Promise)) tiles.delete(key);
	}
}

/** The exact pixel values of an 8-bit RGB/RGBA, non-interlaced PNG (as Terrarium tiles are). */
async function pngPixels(buf: ArrayBuffer) {
	const bytes = new Uint8Array(buf);
	const view = new DataView(buf);
	let width = 0;
	let height = 0;
	let channels = 0;
	const idat: Uint8Array[] = [];
	for (let p = 8; p < bytes.length; ) {
		const len = view.getUint32(p);
		const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
		if (type === 'IHDR') {
			width = view.getUint32(p + 8);
			height = view.getUint32(p + 12);
			const depth = bytes[p + 16];
			const colour = bytes[p + 17];
			const interlace = bytes[p + 20];
			channels = colour === 2 ? 3 : colour === 6 ? 4 : 0;
			if (depth !== 8 || !channels || interlace) throw new Error('unsupported PNG');
		} else if (type === 'IDAT') idat.push(bytes.subarray(p + 8, p + 8 + len));
		else if (type === 'IEND') break;
		p += 12 + len;
	}
	// the image data is one zlib stream across the IDAT chunks: the browser can inflate it
	const raw = new Uint8Array(await new Response(new Blob(idat as BlobPart[]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
	// undo the per-row filters (PNG spec: None, Sub, Up, Average, Paeth)
	const stride = width * channels;
	const out = new Uint8Array(height * stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const src = y * (stride + 1) + 1;
		const row = y * stride;
		for (let x = 0; x < stride; x++) {
			const a = x >= channels ? out[row + x - channels] : 0;
			const b = y ? out[row - stride + x] : 0;
			const c = x >= channels && y ? out[row - stride + x - channels] : 0;
			let v = raw[src + x];
			if (filter === 1) v += a;
			else if (filter === 2) v += b;
			else if (filter === 3) v += (a + b) >> 1;
			else if (filter === 4) {
				const p = a + b - c;
				const pa = Math.abs(p - a);
				const pb = Math.abs(p - b);
				const pc = Math.abs(p - c);
				v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			}
			out[row + x] = v & 255;
		}
	}
	return { width, height, channels, data: out };
}

/** A pixel far above or below all eight neighbours is a bad sample in the source: smooth it. */
function despike(h: Float32Array, cols: number, rows: number, limit: number) {
	const src = h.slice();
	const n = new Float32Array(8);
	for (let r = 1; r < rows - 1; r++)
		for (let c = 1; c < cols - 1; c++) {
			const i = r * cols + c;
			let k = 0;
			for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) n[k++] = src[i + dr * cols + dc];
			let hi = -Infinity;
			let lo = Infinity;
			for (const v of n) {
				if (v > hi) hi = v;
				if (v < lo) lo = v;
			}
			if (src[i] - hi > limit || lo - src[i] > limit) {
				n.sort();
				h[i] = (n[3] + n[4]) / 2;
			}
		}
}

async function decode(z: number, tx: number, ty: number): Promise<Tile> {
	try {
		const r = await fetch(URL_OF(z, tx, ty));
		if (!r.ok) return null;
		const { width, height, channels, data } = await pngPixels(await r.arrayBuffer());
		if (width !== 256 || height !== 256) return null;
		const h = new Float32Array(256 * 256);
		for (let i = 0; i < h.length; i++) {
			const o = i * channels;
			h[i] = data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768;
		}
		despike(h, 256, 256, 50);
		return h;
	} catch {
		return null;
	}
}

function load(z: number, x: number, y: number): Tile | Promise<Tile> {
	const key = `${z}/${x}/${y}`;
	let t = tiles.get(key);
	if (t === undefined) {
		t = decode(z, x, y).then((h) => {
			tiles.delete(key); // re-insert: newest last
			tiles.set(key, h);
			trim();
			return h;
		});
		tiles.set(key, t);
	}
	return t;
}

/** Height in metres at local (x, n); NaN where there's no data. */
export type HeightAt = (x: number, n: number) => number;

/**
 * Heights within `reach` metres of a place, at tile zoom z (12 is ~20-38 m a pixel, 10 is ~4× coarser).
 * Resolves once every tile has landed. Local metres → tile pixel is linearised around the centre
 * (accurate to a fraction of a pixel over tens of km), so sampling is a multiply-add and a
 * bilinear lookup.
 */
export async function heights(centre: LonLat, reach: number, z: number): Promise<HeightAt> {
	await Promise.all(tilesAround(centre, reach, z).map(([x, y]) => load(z, x, y)));
	const plane = localPlane(centre);
	const px = (x: number, n: number) => {
		const [lon, lat] = plane.toLonLat(x, n);
		return [mercX(lon, z) * 256, mercY(lat, z) * 256];
	};
	const [p0x, p0y] = px(0, 0);
	const [pex, pey] = px(1000, 0);
	const [pnx, pny] = px(0, 1000);
	const [ax, ay, bx, by] = [(pex - p0x) / 1000, (pey - p0y) / 1000, (pnx - p0x) / 1000, (pny - p0y) / 1000];
	const at = (xx: number, yy: number) => {
		const t = tiles.get(`${z}/${Math.floor(xx / 256)}/${Math.floor(yy / 256)}`);
		return t instanceof Float32Array ? t[(yy & 255) * 256 + (xx & 255)] : NaN;
	};
	return (x, n) => {
		const fx = p0x + ax * x + bx * n - 0.5;
		const fy = p0y + ay * x + by * n - 0.5;
		const ix = Math.floor(fx);
		const iy = Math.floor(fy);
		const u = fx - ix;
		const v = fy - iy;
		return (at(ix, iy) * (1 - u) + at(ix + 1, iy) * u) * (1 - v) + (at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u) * v;
	};
}
