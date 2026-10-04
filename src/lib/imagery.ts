// Map imagery (satellite / Sentinel-2 / topo) from ordinary XYZ map tiles, stitched into one canvas
// texture that covers the globe's land. The land's shader maps local metres into it with an affine
// transform (uImgU / uImgV): over a few km Web Mercator is as good as linear.
import { CanvasTexture, LinearFilter, SRGBColorSpace, Vector3 } from 'three';
import { localPlane, mercX, mercY, zoomFor, type LonLat } from './geo';

export type Surface = 'painted' | 'satellite' | 'sentinel' | 'topo';

interface TileSource {
	label: string;
	url: (z: number, x: number, y: number) => string;
	/** the sharpest zoom worth fetching */
	maxZoom: number;
	attribution: string;
	/** a photograph (lifted to sit in the pastel palette), not a printed map */
	photo: boolean;
}

export const SOURCES: Record<Exclude<Surface, 'painted'>, TileSource> = {
	satellite: {
		label: 'Satellite',
		url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
		maxZoom: 16,
		attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
		photo: true
	},
	sentinel: {
		label: 'Sentinel-2',
		url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/${z}/${y}/${x}.jpg`,
		maxZoom: 14, // 10 m native resolution: no point going deeper
		attribution: 'Sentinel-2 cloudless 2023 by EOX IT Services GmbH (modified Copernicus Sentinel data), CC BY-NC-SA 4.0',
		photo: true
	},
	topo: {
		label: 'Topo',
		url: (z, x, y) => `https://${'abc'[(x + y) % 3]}.tile.opentopomap.org/${z}/${x}/${y}.png`,
		maxZoom: 15,
		attribution: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap contributors, SRTM',
		photo: false
	}
};

const tileCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadTile(url: string): Promise<HTMLImageElement | null> {
	let p = tileCache.get(url);
	if (!p) {
		p = new Promise((resolve) => {
			const img = new Image();
			img.crossOrigin = 'anonymous'; // or the canvas is "tainted" and WebGL refuses it
			img.onload = () => resolve(img);
			img.onerror = () => resolve(null);
			img.src = url;
		});
		tileCache.set(url, p);
		if (tileCache.size > 600) tileCache.delete(tileCache.keys().next().value!);
	}
	return p;
}

/** at most this many tiles across: a 2048 px texture */
const TILES = 8;

/** The imagery on the land: one canvas texture, painted in as its tiles arrive. */
export class Imagery {
	surface: Surface = 'painted';
	readonly canvas = document.createElement('canvas');
	readonly texture: CanvasTexture;
	/** texture u, v as affine maps of local metres: u = dot(imgU, (x, n, 1)) */
	readonly imgU = new Vector3(0, 0, -10);
	readonly imgV = new Vector3(0, 0, -10);
	private ctx = this.canvas.getContext('2d')!;
	private generation = 0;
	private centre: LonLat | null = null;
	private reach = 0;

	constructor() {
		// full size before the texture first uploads: the GPU keeps the size it was first given, and
		// tiles drawn beyond it later are lost ("offset overflows texture dimensions")
		this.canvas.width = this.canvas.height = TILES * 256;
		this.texture = new CanvasTexture(this.canvas);
		this.texture.colorSpace = SRGBColorSpace;
		this.texture.minFilter = LinearFilter; // no mipmaps: the canvas is repainted progressively
		this.texture.generateMipmaps = false;
	}

	get mix() {
		return this.surface === 'painted' ? 0 : 1;
	}
	get photo() {
		return this.surface !== 'painted' && SOURCES[this.surface].photo;
	}
	get attribution() {
		return this.surface === 'painted' ? null : SOURCES[this.surface].attribution;
	}

	/** Show this surface for the land within `reach` metres of a place. */
	show(surface: Surface, centre: LonLat, reach: number) {
		if (surface === this.surface && centre === this.centre && reach === this.reach) return;
		this.surface = surface;
		this.centre = centre;
		this.reach = reach;
		const gen = ++this.generation;
		if (surface === 'painted') return;
		const src = SOURCES[surface];
		const z = zoomFor(reach, centre.lat, TILES, src.maxZoom);
		const tx0 = Math.floor(mercX(centre.lon, z) - TILES / 2);
		const ty0 = Math.floor(mercY(centre.lat, z) - TILES / 2);
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.texture.needsUpdate = true;

		// local metres -> texture uv (the canvas is flipped on upload: v runs south -> north)
		const plane = localPlane(centre);
		const uv = (x: number, n: number) => {
			const [lon, lat] = plane.toLonLat(x, n);
			return [(mercX(lon, z) - tx0) / TILES, 1 - (mercY(lat, z) - ty0) / TILES];
		};
		const [u0, v0] = uv(0, 0);
		const [ue, ve] = uv(100, 0);
		const [un, vn] = uv(0, 100);
		this.imgU.set((ue - u0) / 100, (un - u0) / 100, u0);
		this.imgV.set((ve - v0) / 100, (vn - v0) / 100, v0);

		let pending = 0;
		for (let j = 0; j < TILES; j++)
			for (let i = 0; i < TILES; i++) {
				pending++;
				loadTile(src.url(z, tx0 + i, ty0 + j)).then((img) => {
					if (gen !== this.generation) return; // superseded
					if (img) this.ctx.drawImage(img, i * 256, j * 256);
					// batch the uploads: every few tiles, and when the last one lands
					if (--pending % 6 === 0 || pending === 0) this.texture.needsUpdate = true;
				});
			}
	}

	dispose() {
		this.texture.dispose();
	}
}
