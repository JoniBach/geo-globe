# Geo Globe

Any place on Earth as a terrain diorama on a compass plinth. Search for a place (or type
coordinates) and its landscape rises out of the plinth with real heights, painted or draped in
satellite, Sentinel-2 or topo imagery, with roads, rivers, lakes, park edges and place names, the
real sun and moon for the time of day there, and today's weather. Faint elevation lines and roads
carry on beyond the rim and fade into the air.

Everything is fetched live in the browser from free, open sources: no API keys, no server, no
build step for data. The whole app is about 4,000 lines.

Built as a Three.js workshop demo, from the "globe" view of
[GT Retrospective](https://gt-retrospective.vercel.app/the-parks-26/), a motorcycle tour
retrospective, with everything specific to that trip (the bike, routes, GPS tracks, photos,
stories) taken out so the spectacle is all that's left.

**Live: https://geo-globe-seven.vercel.app** (deployed by Vercel from `main`).

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # static files in build/, host anywhere
npm run check        # types
```

Open straight at a place: `/?lat=53.0685&lon=-4.0763&name=Yr%20Wyddfa`.

## Stack

- **Three.js** for the 3D, through **Threlte** (Three.js as Svelte components: `<T.Mesh>`,
  `useTask` for the frame loop, `<HTML>` for labels pinned to 3D points).
- **SvelteKit + Svelte 5** for the page and state (runes: `$state`, `$derived`, `$effect`),
  built as static files (`@sveltejs/adapter-static`).
- **@mapbox/vector-tile + pbf** to read OpenStreetMap vector tiles.
- **d3-interpolate** for the sky's colour blends.

## Where the data comes from

| What | Source | Format | Code |
| --- | --- | --- | --- |
| Heights | [Terrarium tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen, AWS Open Data) | PNG tiles whose pixels *encode heights* | `src/lib/elevation.ts` |
| Satellite | Esri World Imagery | JPEG map tiles | `src/lib/imagery.ts` |
| Sentinel-2 | EOX Sentinel-2 cloudless 2023 (CC BY-NC-SA) | JPEG map tiles | `src/lib/imagery.ts` |
| Topo | OpenTopoMap (CC BY-SA) | PNG map tiles | `src/lib/imagery.ts` |
| Roads, rivers, water, parks, names | OpenStreetMap via [OpenFreeMap](https://openfreemap.org) (OpenMapTiles schema) | Vector tiles (protobuf) | `src/lib/osm.ts` |
| Weather and time zone | [Open-Meteo](https://open-meteo.com) forecast API (CC BY 4.0) | JSON | `src/lib/weather.ts` |
| Search | [Photon](https://photon.komoot.io) (komoot, OSM) | GeoJSON | `src/lib/search.ts` |
| Sun and moon | Astronomy formulas (the suncalc family) | Maths | `src/lib/globe/sky.ts` |

Each source's attribution is shown along the bottom of the page (`src/lib/ui/Credits.svelte`).

## How it fits together

```
search / coordinates / URL ──▶ App.go(place)                       src/lib/app.svelte.ts
                                  │  all at once:
                                  ├─ heights near (z12) + far (z9–11)  elevation.ts
                                  ├─ map: roads, rivers, water, parks, names   osm.ts
                                  └─ weather for today, hour by hour  weather.ts
                                  ▼
                               app.loaded ──▶ GlobeStage: old land sinks, new land rises
                                                 └─ GlobeScene (one place)
                                                      ├─ DioramaTerrain  the land + its earth wall
                                                      ├─ GlobeLines      roads, rivers, park edges on it
                                                      ├─ GlobeHalo       the wispy surroundings
                                                      ├─ GlobeLabels     peaks, lakes, towns
                                                      ├─ GlobeWeather    clouds and rain
                                                      └─ sun, moon, light, sky colour
```

Coordinates: everything is turned into a flat local plane in metres around the place
(`src/lib/geo.ts`: x east, n north), and the scene is `(x, height, -n)`: y up, north into the
screen. The globe is always 1,800 scene units across; the land is scaled to fit, so a 6 km globe
shows more land with flatter hills.

## Spotlights for the workshop

Good things to open and talk through, roughly in the order they happen:

1. **Pixels that are heights** (`elevation.ts`): Terrarium encodes `R × 256 + G + B / 256 − 32768`
   metres in each pixel. Why the PNG is decoded by hand (`DecompressionStream` + PNG row filters)
   instead of via a canvas: colour management can shift a red value by one, which is 256 m.
2. **Tiles and zooms** (`geo.ts`): Web Mercator `z/x/y`, how many tiles cover a radius, and why a
   local flat plane is accurate enough over a few km.
3. **Grid to mesh** (`DioramaTerrain.svelte`): a `BufferGeometry` from a height grid, normals from
   neighbouring heights, and a disc cut out *in the fragment shader* (`discard`), not the geometry.
4. **One shader, many looks** (same file): pastel colour by height, imagery draped by an affine
   uv transform, hillshade from the real sun, water shimmer, and elevation lines drawn with
   `fract()` and `fwidth()` so every line is about a pixel wide at any zoom.
5. **Vector tiles** (`osm.ts`): protobuf layers, tile coordinates to metres, polygons into a
   canvas water mask, and removing the straight cuts where tiles clip a park's outline.
6. **Lines on a landscape** (`GlobeLines.svelte`): roads as ribbons (two vertices per point,
   pushed out sideways), draped on the ground, with dashes in the shader.
7. **The wispy surroundings** (`GlobeHalo.svelte`): a transparent surface that draws *only* its
   contour lines, faded by distance, with an aperture that opens as the land rises.
8. **Sun, moon, sky** (`sky.ts`, `GlobeScene.svelte`): altitude and azimuth from time and place,
   the moon lit by the sun so it shows its phase, and a sky gradient from the sun's height.
9. **Weather as a scene** (`GlobeWeather.svelte`): clouds from cloud cover drifting with the wind,
   rain as GPU-animated line segments, slanted by the wind.
10. **Transitions** (`GlobeStage.svelte`): the same plinth stays while the land falls and rises;
    the light and the sun glide rather than jump (`lighting.ts`).
11. **Frame pacing** (`FrameGovernor.svelte`): full speed while you drag, 15 fps when nothing
    moves, without changing how fast anything animates.

## Ideas to try

- Swap the painted palette in `DioramaTerrain.svelte`'s `pastel()` for your own.
- Add another imagery source to `SOURCES` in `imagery.ts` (any XYZ tile URL with CORS).
- Show a different OpenMapTiles layer from `osm.ts` (buildings, `poi`, `aerodrome_label`…).
- Use Open-Meteo's hourly snowfall or visibility to add snow or fog to `GlobeWeather.svelte`.
- Turn the plinth's lettering into something else in `Plinth.svelte`.

## Limits

- Heights are Terrarium's ~20–40 m pixels, so summits come out a little low (the Matterhorn
  reads about 4,280 m rather than 4,478 m).
- Web Mercator stops at about 85° north and south.
- The weather is today's forecast; the time slider runs through today in the place's own time zone.
- It needs a network connection: every source is live.
