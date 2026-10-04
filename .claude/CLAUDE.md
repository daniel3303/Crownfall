# Crownfall project rules

## Build and run

- Run the game through Docker: `docker compose up --build`, then http://localhost:8080.
- Server tests run on Microsoft Testing Platform: `dotnet test --project <path>`; never pass `--nologo` (it runs zero tests).
- Regenerate golden fixtures only for an intentional change: `CROWNFALL_UPDATE_FIXTURES=1 dotnet test --project tests/Crownfall.Server.UnitTests`.
- `window.crownfall` (session and store) exists only in Vite dev builds; browser automation against the Docker build cannot use it.
- Headless Chrome on SwiftShader reports ~3-10 fps whatever the scene costs; measure performance with `--use-angle=metal`.

## Simulation

- The simulation must stay deterministic: same seed and commands, same match. The vision fixture doubles as the determinism guard.
- Unit, building and node ids in `content/game.json` are referenced by map generation, bots and tests; rename display names only.

## Rendering (Babylon.js)

- The page CSP is `script-src 'self'`: no Draco or meshopt decoders (they load from a CDN); models use `KHR_mesh_quantization` only.
- Load glTF for StandardMaterial with `pluginOptions: { gltf: { useSRGBBuffers: false } }`; it lights in gamma space and sRGB textures come out near black. Unit models keep the loader's PBR material and defaults.
- After `Mesh.MergeMeshes` on glTF meshes, set `sideOrientation = CounterClockWise`; otherwise the inside faces render and only the sky light reaches them.
- Create the sun before any other light; Babylon dropped the sun's shadows when it was not the first light.
- Character instance matrices are conjugated by the loader's mirrored root (`W·D·W⁻¹`); unit models face +Z and need a +π/2 yaw for game facing 0.
- Unit atlas texels with alpha 128 hold grey cloth that the per-instance `teamColor` attribute (rgb display colour, w look seed) multiplies (`UnitSurfacePlugin`); keep unit materials opaque.
- Unit surface maps pack occlusion, roughness, metal and a tone class (alpha: 255 skin, 192 dyed hide, 0 hair, 128 other) that per-unit shading reads; glTF `COLOR_0` is linear.
- A move clip at rate 1 covers `look.stride × look.scale` world units per second; re-measure `stride` in `LOOKS` when a locomotion clip changes.
- `vat-blend.ts` replaces Babylon's `bakedVertexAnimation` include: settings carry the row the CPU picked (`vat-clock.ts`), not a clock; re-check it on a Babylon upgrade.
- The unit material blends to the next row and crossfades clips (`VAT_BLEND`); shadow and depth passes show the plain row.
- Units render a little over one tick behind the fastest recent snapshot (`SnapshotClock`); the clock slows or speeds up, never steps back.
- Buildings are procedural (`building-recipes.ts` registers one recipe per building with one look per content level), modelled with fronts toward +Z and drawn with `FRONT_YAW` so fronts face the camera.
- Procedural meshes wind front faces with the edge cross product pointing into the mesh (`GeometryBuilder.triangle`); `test/building-recipes.test.ts` guards it.
- Building team colour is a per-instance `buildingTeam` attribute that only cloth and `Paint.team` faces (stored as a negative shade) read; never name it `color` (Babylon's instance colour tints the whole albedo).
- Babylon renders every shadow caster each frame; register casters through `SceneLighting.addCaster`, passing `culled` for map-wide sets such as forest chunks.
- Thin-instance buffers live on the geometry: give each batch of a shared template its own copy (`clone` + `makeGeometryUnique`).

## Assets

- `tools/assets` rebuilds `client/public/assets` (`npm run build`): KayKit lake plants (`build.mjs`; set `KAYKIT_DIR` to reuse local clones at the pinned commits), unit characters (`characters.mjs`), unit portraits (`portraits.mjs`), ground textures (`terrain.mjs`), building surfaces (`materials.mjs`), dressed stone and slate building surfaces (`buildings.mjs`), the sky light probe (`sky.mjs`) and trees (`trees.mjs`).
- Pack commits are pinned in `build.mjs`; bump the SHA to take a pack update.
- Poly Haven, ambientCG, Quaternius itch.io and Poly Pizza downloads are not versioned; they cache in `tools/assets/.cache`; delete a cached file to take an update.
- `characters.mjs` names clips by role (`Idle`, `Move`, `Attack`, `Death`, `Dead`, villager `Work`/`Harvest`, hero `Cast0`-`Cast3`); `LOOKS` in `unit-layer.ts` must use the same names.
- Units stay under ~6k triangles with 512² WebP albedo, normal and surface atlases and quantized attributes (`test/unit-assets.test.ts` checks); `PARTS=1 node characters.mjs` prints per-part triangles.
- Held items are placed in the bind (T) pose; a staff or bow that must stand upright in a clip takes an `aim` (`aimedGrip`), since a bind-pose grip points wherever that clip turns the hand; a hand-held item tips over in `Death` instead of digging into the ground (`groundedGrip`), and lists any other clip it falls in (a roll) under `ground`.
- A mounted unit is one skeleton (`mountRig` in `character-poses.mjs`) in its mount's units: the rider is `RIDER_SCALE` times larger there, so its grips scale up by it and its look's `scale` scales down by it.
- `characters.mjs` needs `unzip`; its first run downloads ~440 MB of Quaternius zips into `tools/assets/.cache/itch`.
- `portraits.mjs` renders `client/public/assets/portraits/<modelId>.webp` for every built character model, so a model built ahead of its unit already has one, with installed Google Chrome on SwiftShader: no GPU dependence, but bytes can change with the Chrome version; build the unit's glb first.
- `terrain.mjs` layer order must match `LAYERS` in `client/src/render/terrain-field.ts`, and `materials.mjs` then `buildings.mjs` order must match `MATERIALS` in `client/src/render/building-geometry.ts`.
- Surface maps (`texture-sets.mjs`) pack OpenGL normal XY in RG and roughness in B.
- ez-tree is pinned at 1.1.0: later releases drop the material API the build stubs around.
- `sounds.mjs` builds `client/public/assets/audio` as MP3, the one codec every browser's `decodeAudioData` reads; it needs `ffmpeg` (libmp3lame) and `bsdtar` and caches ~550 MB of sources on its first run.
- Firefox and WebKit keep MP3 encoder padding, so loops carry wrap-around guard audio and play only their `loops.json` window.
- Credit new packs and texture sources in `CREDITS.md`.
