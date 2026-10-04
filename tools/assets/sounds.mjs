// Builds client/public/assets/audio from CC0 recordings: cuts single takes out of multi-take sessions, layers
// composites, makes loops seamless, loudness-normalizes per category and encodes MP3 (mono effects, stereo beds),
// the one format every browser's decodeAudioData reads.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(here, ".cache", "sounds");
const work = join(cache, "work");
const out = join(here, "../../client/public/assets/audio");
const SAMPLE_RATE = 44100;
const USER_AGENT = "crownfall-asset-build/1.0";
const OGA = "https://opengameart.org/sites/default/files/";
const KENNEY = "https://kenney.nl/media/pages/assets/";
// One-shots lose everything under this before their first and after their last sound.
const SILENCE_DB = -60;
const FADE_IN = 0.004;
const FADE_OUT = 0.03;
// Loudness of a one-shot is its loudest 50 ms window, so a long tail does not make the hit itself louder.
const TRANSIENT_WINDOW = 0.05;
const ARCHIVE = /\.(zip|7z)$/;

// Kenney links carry a version hash: bump it to take a pack update. OpenGameArt file names are stable.
const SOURCES = {
  kenneyRpg: `${KENNEY}rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip`,
  kenneyImpact: `${KENNEY}impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip`,
  rpgPack: `${OGA}rpg_sound_pack.zip`,
  woodMetal: `${OGA}100-CC0-wood-metal-SFX.zip`,
  woodCracks: `${OGA}independent_nu_ljudbank-wood_crack_hit_destruction.7z`,
  thwack: `${OGA}thwack-1.0.zip`,
  qubodupImpact: `${OGA}qubodupImpact.7z`,
  yells: `${OGA}yelling%20sounds.zip`,
  weaponImpacts1: `${OGA}medieval_sfx_weapon_on_weapon_1_of_2.7z`,
  weaponImpacts2: `${OGA}medieval_sfx_weapon_on_weapon_2_of_2.7z`,
  weaponTextures1: `${OGA}medieval_sfx_textures_1_of_2.7z`,
  weaponTextures2: `${OGA}medieval_sfx_textures_2_of_2.7z`,
  explosion: `${OGA}explosion1_0.ogg`,
  distantBoom: `${OGA}NenadSimic%20-%20Muffled%20Distant%20Explosion.wav`,
  warHorns: `${OGA}war_horns.wav`,
  horn: `${OGA}theircoming_0.ogg`,
  fanfare: `${OGA}fanfare_0.ogg`,
  drums: `${OGA}horde_war_drums_by_william_hector.wav`,
  crowd: `${OGA}crowd_shouting_0.ogg`,
  parkBirds: `${OGA}park_ambience_birds.wav`,
  birds: `${OGA}birds-isaiah658_0.ogg`,
  battle: `${OGA}battle_1.wav`,
  victory: `${OGA}victory.wav`,
  defeat: `${OGA}defeat.wav`,
};

// Loudness targets in dBFS (a one-shot's loudest window, a bed's mean); peaks stay under the ceiling. The game's
// mixer sets the final balance, so these only make every file in a category land at the same level.
const CATEGORIES = {
  ui: { channels: 1, loudness: -20, ceiling: -3, quality: 5, measure: "transient" },
  combat: { channels: 1, loudness: -15, ceiling: -1, quality: 5, measure: "transient" },
  voice: { channels: 1, loudness: -16, ceiling: -1, quality: 5, measure: "transient" },
  heavy: { channels: 1, loudness: -13, ceiling: -1, quality: 5, measure: "transient" },
  cue: { channels: 1, loudness: -15, ceiling: -1, quality: 4, measure: "transient" },
  jingle: { channels: 2, loudness: -15, ceiling: -1, quality: 4, measure: "transient" },
  stinger: { channels: 2, loudness: -18, ceiling: -1, quality: 6, measure: "mean" },
  ambience: { channels: 2, loudness: -24, ceiling: -3, quality: 7, measure: "mean" },
  music: { channels: 2, loudness: -19, ceiling: -1, quality: 6, measure: "mean" },
};

/** One clip of a source: an archive member (or the whole download) between `start` and `end` seconds. */
function clip(source, member, start, end, options = {}) {
  return { source, member, start, end, ...options };
}

// Takes cut from Still North Media's multi-take sessions; windows end before the next take starts.
const CLASHES = [
  clip("weaponImpacts2", "Seax Norse Sword Blade on Blade.wav", 1.37, 1.85),
  clip("weaponImpacts2", "Seax Norse Sword Blade on Blade.wav", 6.035, 6.55),
  clip("weaponImpacts2", "Seax Norse Sword Blade on Blade.wav", 0.15, 0.65),
  clip("weaponImpacts2", "Spear Norse Sword Blade on Blade.wav", 5.385, 5.85),
  clip("weaponImpacts1", "Axe Norse Sword Blade on Blade.wav", 5.86, 6.25),
  clip("weaponImpacts1", "Axe Norse Sword Blade on Blade.wav", 4.045, 4.55),
  clip("weaponImpacts1", "Sabre Katana Blade on Blade.wav", 12.275, 12.78),
  clip("weaponImpacts1", "Sabre Katana Blade on Blade.wav", 0.45, 0.95),
];
const MACE_HIT = clip("weaponImpacts1", "Mace Norse Sword Blade.wav", 5.315, 5.74);
const AXE_HIT = clip("weaponImpacts1", "Axe Norse Sword Blade on Blade.wav", 2.085, 2.6);
const AXE_WHOOSH = clip("weaponTextures2", "Axe Swing.wav", 1.45, 2.05);
const kenneyRpg = (name) => clip("kenneyRpg", `Audio/${name}.ogg`);
const kenneyImpact = (name) => clip("kenneyImpact", `Audio/${name}.ogg`);
const rpgPack = (path) => clip("rpgPack", `RPG Sound Pack/${path}.wav`);
const woodMetal = (name) => clip("woodMetal", `${name}.ogg`);
const crack = (n) => clip("woodCracks", `wood_impact/crack0${n}.mp3.flac`);
const yell = (name) => clip("yells", `yelling sounds/${name}.wav`);
const DISTANT_BOOM = clip("distantBoom", null, 0, 1.8);

/** A one-shot sound: each variant is a list of layers mixed into one file. */
function oneShot(name, category, variants, fadeOut = FADE_OUT) {
  return { name, category, variants: variants.map((v) => (Array.isArray(v) ? v : [v])), fadeOut };
}

const ONE_SHOTS = [
  // Orders and selection.
  oneShot("select", "ui", [kenneyRpg("handleSmallLeather"), kenneyRpg("handleSmallLeather2"), kenneyRpg("beltHandle1")]),
  oneShot("move", "ui", [rpgPack("inventory/armor-light"), kenneyRpg("cloth2"), kenneyRpg("cloth4")]),
  oneShot("attack", "ui", [kenneyRpg("drawKnife1"), kenneyRpg("drawKnife2"), kenneyRpg("drawKnife3")]),
  oneShot("place", "ui", [kenneyImpact("impactPlank_medium_000"), kenneyImpact("impactPlank_medium_001"), kenneyImpact("impactPlank_medium_002")]),
  // Combat.
  oneShot("clash", "combat", CLASHES),
  oneShot("chop", "combat", [kenneyImpact("impactWood_heavy_000"), kenneyImpact("impactWood_heavy_001"), kenneyImpact("impactWood_heavy_002"), kenneyImpact("impactWood_heavy_003"), kenneyRpg("chop")]),
  oneShot("crossbow", "combat", [
    clip("weaponTextures1", "Crossbow Shoot.wav", 0.325, 0.78),
    clip("weaponTextures1", "Crossbow Shoot.wav", 0.84, 1.36),
    clip("weaponTextures1", "Crossbow Shoot.wav", 1.41, 1.9),
    clip("weaponTextures1", "Crossbow Shoot.wav", 2.49, 2.95),
    clip("weaponTextures1", "Crossbow Shoot.wav", 2.975, 3.16),
  ]),
  oneShot("bow", "combat", [
    clip("weaponTextures1", "Scythian Recurve Shoot.wav", 0.21, 0.8),
    clip("weaponTextures1", "Scythian Recurve Shoot.wav", 2.95, 3.38),
    clip("weaponTextures1", "Scythian Recurve Shoot.wav", 3.395, 3.82),
    clip("weaponTextures1", "English Longbow Shoot.wav", 1.25, 1.95),
    clip("weaponTextures1", "English Longbow Shoot.wav", 3.2, 3.8),
  ]),
  oneShot("arrowHit", "combat", [
    clip("thwack", "PCM/thwack-02.wav"),
    clip("thwack", "PCM/thwack-03.wav"),
    clip("thwack", "PCM/thwack-05.wav"),
    clip("thwack", "PCM/thwack-06.wav"),
    clip("qubodupImpact", "qubodupImpact/qubodupImpactMeat01.flac"),
  ]),
  oneShot("arrowHitWood", "combat", [kenneyImpact("impactWood_light_000"), kenneyImpact("impactWood_light_001"), kenneyImpact("impactWood_light_002"), kenneyImpact("impactWood_light_003")]),
  oneShot("death", "voice", [yell("1yell2"), yell("1yell8"), yell("2yell3"), yell("3yell4"), yell("3yell8"), yell("yell7")], 0.08),
  // Skeletons rattle apart: falling sticks pitched up read as bones.
  oneShot("deathBones", "combat", [2, 3, 4].map((n) => clip("woodMetal", `wood_falling_0${n}.ogg`, undefined, undefined, { rate: 1.25 })), 0.08),
  oneShot("collapse", "heavy", [1, 2, 3].map((n) => [
    crack(n),
    clip("woodCracks", `wood_impact/impactwood0${n + 1}.mp3.flac`, 0, 2.2, { at: 0.25, gain: -3 }),
    woodMetal(`wood_breaking_0${(n % 2) + 1}`),
    { ...DISTANT_BOOM, filter: "lowpass=f=900", gain: -4 },
  ]), 0.6),
  // Doomfall: a heavy arrow's approach slowed into a falling rock, then an explosion over a deep thud and debris.
  oneShot("meteorFall", "heavy", [[clip("weaponTextures1", "Scythian Recurve Heavy Arrow Approach.wav", 5.15, 6.125, { rate: 0.6, filter: "lowpass=f=5000" })]], 0.15),
  oneShot("meteor", "heavy", [
    [clip("explosion", null, 0, 3.6), { ...DISTANT_BOOM, gain: -3 }, { ...crack(4), at: 0.08, gain: -10 }],
    [clip("explosion", null, 0, 3.6, { rate: 0.85 }), { ...DISTANT_BOOM, gain: -2 }, { ...crack(5), at: 0.1, gain: -10 }],
  ], 0.6),
  oneShot("cleave", "combat", [
    [AXE_WHOOSH, { ...MACE_HIT, at: 0.12 }, { ...AXE_HIT, at: 0.24, gain: -4 }],
    [{ ...AXE_WHOOSH, rate: 0.9 }, { ...AXE_HIT, at: 0.13 }, { ...CLASHES[0], at: 0.25, gain: -4 }],
  ], 0.1),
  // Charge: a slowed rush of air, then the hero barrels into a shield and a body.
  oneShot("charge", "combat", [
    [{ ...AXE_WHOOSH, rate: 0.8 }, { ...MACE_HIT, at: 0.2 }, { ...kenneyImpact("impactPunch_heavy_000"), at: 0.22, gain: -4 }],
    [{ ...AXE_WHOOSH, rate: 0.75 }, { ...AXE_HIT, at: 0.22 }, { ...kenneyImpact("impactPunch_heavy_002"), at: 0.24, gain: -4 }],
  ], 0.1),
  // Cues the player hears wherever the camera is.
  oneShot("rally", "cue", [clip("warHorns", null, 0.2, 2.35)], 0.35),
  oneShot("alert", "cue", [clip("horn", null, 0, 2.3), clip("horn", null, 3.0, 5.5)], 0.3),
  oneShot("levelUp", "jingle", [clip("fanfare", null, 0, 2.3)], 0.15),
  oneShot("built", "cue", [
    [woodMetal("wood_hammer_01"), { ...woodMetal("wood_hammer_02"), at: 0.22 }, { ...woodMetal("wood_hammer_01"), at: 0.44, rate: 1.06 }, { ...kenneyImpact("impactPlank_medium_003"), at: 0.75 }],
    [woodMetal("wood_hammer_02"), { ...woodMetal("wood_hammer_01"), at: 0.2, rate: 0.95 }, { ...woodMetal("wood_hammer_02"), at: 0.42 }, { ...kenneyImpact("impactPlank_medium_004"), at: 0.72 }],
  ], 0.1),
  oneShot("trained", "cue", [
    [rpgPack("inventory/chainmail1"), { ...rpgPack("battle/sword-unsheathe2"), at: 0.2, gain: -4 }],
    [rpgPack("inventory/chainmail2"), { ...rpgPack("battle/sword-unsheathe4"), at: 0.25, gain: -4 }],
  ]),
  // Resources dropped off by the player's villagers.
  oneShot("coin", "ui", [kenneyRpg("handleCoins"), kenneyRpg("handleCoins2"), rpgPack("inventory/coin3")]),
  oneShot("depositWood", "ui", [woodMetal("wood_hit_01"), woodMetal("wood_hit_03"), woodMetal("wood_hit_05")]),
  oneShot("depositStone", "ui", [kenneyImpact("impactMining_000"), kenneyImpact("impactMining_002"), kenneyImpact("impactMining_004")]),
  oneShot("depositFood", "ui", [kenneyRpg("dropLeather"), rpgPack("inventory/cloth-heavy")]),
  // End of match: the first phrases of the themes, faded out.
  oneShot("victory", "stinger", [clip("victory", null, 0, 16)], 3),
  oneShot("defeat", "stinger", [clip("defeat", null, 0, 18)], 3.5),
];

// The war bed is three passes of the drum loop, so the drums wrap on their own beat.
const DRUM_REPEATS = 3;
const LOOP_CROSSFADE = 2;
const WAR_SEED = 0x5eed;
const PEACE_LENGTH = 48;
// Firefox and WebKit decode MP3 with up to ~2300 extra samples at the ends (encoder delay and padding), so each loop
// carries this much of its own tail before it and head after it; any loop window inside that wraps seamlessly.
const LOOP_GUARD_SAMPLES = 4096;
const LOOP_MANIFEST = "loops.json";

/** Distant fighting for the war bed: clashes, cries and a horn, muffled by distance and scattered by a fixed seed. */
function warTexture(length) {
  const random = mulberry32(WAR_SEED);
  const layers = [
    clip("crowd", null, 0, 27.3, { filter: "lowpass=f=2200,aecho=0.8:0.7:90|160:0.35|0.25", gain: -4 }),
    clip("crowd", null, 0, 27.3, { at: 24, filter: "lowpass=f=1800,aecho=0.8:0.7:110|190:0.35|0.25", gain: -6 }),
    clip("warHorns", null, 0.2, 2.35, { at: 15.5, filter: "lowpass=f=1500,aecho=0.8:0.8:240|420:0.4|0.3", gain: -10 }),
  ];
  const CLASH_COUNT = 34;
  for (let i = 0; i < CLASH_COUNT; i++) {
    const take = CLASHES[Math.floor(random() * CLASHES.length)];
    layers.push({ ...take, at: random() * (length + LOOP_CROSSFADE - 1), rate: 0.85 + random() * 0.3, gain: -16 - random() * 10, filter: "lowpass=f=2600,aecho=0.8:0.6:70|130:0.3|0.2" });
  }
  const CRIES = ["1yell4", "2yell2", "3yell6", "yell3"];
  for (const cry of CRIES) layers.push({ ...yell(cry), at: random() * (length - 2), gain: -22, filter: "lowpass=f=1800,aecho=0.8:0.7:120|200:0.4|0.3" });
  return layers;
}

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Sources -------------------------------------------------------------------------------

async function download(url, file) {
  if (existsSync(file)) return;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

/** Local path of a source download, or of one member extracted from an archive download. */
async function sourcePath(source, member) {
  const url = SOURCES[source];
  const downloaded = join(cache, decodeURIComponent(basename(url)));
  await download(url, downloaded);
  if (!member) return downloaded;
  if (!ARCHIVE.test(downloaded)) throw new Error(`${source} is not an archive`);
  const dir = join(cache, source);
  const path = join(dir, member);
  if (!existsSync(path)) {
    mkdirSync(dir, { recursive: true });
    // bsdtar reads both zip and 7z, so no 7-Zip install is needed.
    execFileSync("bsdtar", ["-xf", downloaded, "-C", dir, member]);
  }
  return path;
}

// --- Rendering -----------------------------------------------------------------------------

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
}

function layout(channels) {
  return channels === 1 ? "mono" : "stereo";
}

/** The filter chain that cuts, pitches, filters and places one layer. */
function layerChain(input, layer, channels) {
  const trim = [layer.start !== undefined ? `start=${layer.start}` : "", layer.end !== undefined ? `end=${layer.end}` : ""].filter(Boolean).join(":");
  const steps = [];
  if (trim) steps.push(`atrim=${trim}`, "asetpts=PTS-STARTPTS");
  steps.push(`aresample=${SAMPLE_RATE}`, `aformat=sample_fmts=fltp:channel_layouts=${layout(channels)}`);
  if (layer.rate) steps.push(`asetrate=${Math.round(SAMPLE_RATE * layer.rate)}`, `aresample=${SAMPLE_RATE}`);
  if (layer.filter) steps.push(layer.filter);
  if (layer.gain) steps.push(`volume=${layer.gain}dB`);
  if (layer.at) steps.push(`adelay=${Math.round(layer.at * 1000)}:all=1`);
  return `[${input}:a]${steps.join(",")}`;
}

/** Mixes layers into a float WAV; `tail` is appended to the graph after the mix. */
async function renderLayers(layers, channels, file, tail = []) {
  const inputs = [];
  for (const layer of layers) {
    if (layer.loops) inputs.push("-stream_loop", String(layer.loops));
    inputs.push("-i", await sourcePath(layer.source, layer.member));
  }
  const chains = layers.map((layer, i) => `${layerChain(i, layer, channels)}[l${i}]`);
  const labels = layers.map((_, i) => `[l${i}]`).join("");
  const mix = layers.length > 1 ? `${labels}amix=inputs=${layers.length}:normalize=0:duration=longest` : `${labels}anull`;
  const graph = [...chains, [mix, ...tail].join(",")].join(";");
  ffmpeg([...inputs, "-filter_complex", graph, "-ac", String(channels), "-c:a", "pcm_f32le", file]);
}

/** Removes leading and trailing silence; the reversals let silenceremove trim the end too. */
const TRIM_SILENCE = [`silenceremove=start_periods=1:start_threshold=${SILENCE_DB}dB`, "areverse", `silenceremove=start_periods=1:start_threshold=${SILENCE_DB}dB`, "areverse"];

/**
 * Turns `file` (loop + crossfade long) into a loop that wraps seamlessly: its tail fades into its head. Unrelated
 * sounds keep their power with an equal-power curve; a periodic bed meets itself and needs the linear one.
 */
function seamLoop(file, loopFile, loopSamples, crossfadeSamples, curve) {
  const graph = [
    "[0:a]asplit[a][b]",
    `[a]atrim=start_sample=${crossfadeSamples}:end_sample=${loopSamples + crossfadeSamples},asetpts=PTS-STARTPTS[body]`,
    `[b]atrim=end_sample=${crossfadeSamples},asetpts=PTS-STARTPTS[head]`,
    `[body][head]acrossfade=ns=${crossfadeSamples}:c1=${curve}:c2=${curve}`,
  ].join(";");
  ffmpeg(["-i", file, "-filter_complex", graph, "-c:a", "pcm_f32le", loopFile]);
}

/** Decodes a rendered file and measures its duration, peak and loudness in dBFS. */
function measure(file, kind) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
  const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  let peak = 0;
  let sum = 0;
  for (const s of samples) {
    peak = Math.max(peak, Math.abs(s));
    sum += s * s;
  }
  let loudness = sum / samples.length;
  if (kind === "transient") {
    const window = Math.round(SAMPLE_RATE * TRANSIENT_WINDOW);
    loudness = 0;
    for (let start = 0; start < samples.length; start += Math.floor(window / 2)) {
      let energy = 0;
      const end = Math.min(samples.length, start + window);
      for (let i = start; i < end; i++) energy += samples[i] * samples[i];
      loudness = Math.max(loudness, energy / window);
    }
  }
  const db = (value) => 20 * Math.log10(Math.max(value, 1e-9));
  return { duration: samples.length / SAMPLE_RATE, peak: db(peak), loudness: db(Math.sqrt(loudness)) };
}

/** Normalizes a rendered file to its category and encodes the MP3 without tags, so reruns are byte-identical. */
function encode(file, name, category, fadeOut) {
  const spec = CATEGORIES[category];
  const level = measure(file, spec.measure);
  const gain = Math.min(spec.loudness - level.loudness, spec.ceiling - level.peak);
  const filters = [`volume=${gain.toFixed(2)}dB`];
  if (fadeOut !== undefined) {
    filters.push(`afade=t=in:d=${FADE_IN}`, `afade=t=out:st=${Math.max(0, level.duration - fadeOut).toFixed(3)}:d=${fadeOut}`);
  }
  const target = join(out, `${name}.mp3`);
  ffmpeg([
    "-i", file, "-af", filters.join(","), "-ac", String(spec.channels), "-ar", String(SAMPLE_RATE),
    "-c:a", "libmp3lame", "-q:a", String(spec.quality),
    "-map_metadata", "-1", "-id3v2_version", "0", "-write_id3v1", "0", "-fflags", "+bitexact", "-flags:a", "+bitexact",
    target,
  ]);
  return target;
}

async function buildOneShot(sound) {
  const files = [];
  const channels = CATEGORIES[sound.category].channels;
  for (const [i, layers] of sound.variants.entries()) {
    const name = `${sound.name}-${i + 1}`;
    const rendered = join(work, `${name}.wav`);
    await renderLayers(layers, channels, rendered, TRIM_SILENCE);
    files.push(encode(rendered, name, sound.category, sound.fadeOut));
  }
  return files;
}

/** Renders layers one crossfade past the loop length and folds that tail over the head. */
async function renderLoop(name, layers, channels, loopSamples, crossfadeSamples, curve) {
  const rendered = join(work, `${name}-raw.wav`);
  const length = loopSamples + crossfadeSamples;
  await renderLayers(layers, channels, rendered, [`apad=whole_len=${length}`, `atrim=end_sample=${length}`]);
  const looped = join(work, `${name}.wav`);
  seamLoop(rendered, looped, loopSamples, crossfadeSamples, curve);
  return looped;
}

/** A seamless loop of layers, plus an optional bed that repeats on its own period underneath. */
async function buildLoop(name, category, layers, loopSeconds, crossfadeSeconds, bed) {
  const channels = CATEGORIES[category].channels;
  const loopSamples = Math.round(loopSeconds * SAMPLE_RATE);
  const crossfadeSamples = Math.round(crossfadeSeconds * SAMPLE_RATE);
  let loop = await renderLoop(name, layers, channels, loopSamples, crossfadeSamples, "qsin");
  if (bed) {
    const bedLoop = await renderLoop(`${name}-bed`, [bed], channels, loopSamples, crossfadeSamples, "tri");
    const mixed = join(work, `${name}-mixed.wav`);
    ffmpeg(["-i", loop, "-i", bedLoop, "-filter_complex", "amix=inputs=2:normalize=0:duration=first", "-c:a", "pcm_f32le", mixed]);
    loop = mixed;
  }
  const guarded = join(work, `${name}-guarded.wav`);
  const graph = [
    "[0:a]asplit=3[tail][body][head]",
    `[tail]atrim=start_sample=${loopSamples - LOOP_GUARD_SAMPLES},asetpts=PTS-STARTPTS[before]`,
    `[head]atrim=end_sample=${LOOP_GUARD_SAMPLES},asetpts=PTS-STARTPTS[after]`,
    "[before][body][after]concat=n=3:v=0:a=1",
  ].join(";");
  ffmpeg(["-i", loop, "-filter_complex", graph, "-c:a", "pcm_f32le", guarded]);
  const window = { start: LOOP_GUARD_SAMPLES / SAMPLE_RATE, end: (LOOP_GUARD_SAMPLES + loopSamples) / SAMPLE_RATE };
  return { file: encode(guarded, name, category), name, window };
}

async function buildLoops() {
  const drumSeconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=duration_ts", "-of", "csv=p=0", await sourcePath("drums")]).toString().trim()) / SAMPLE_RATE;
  const warSeconds = drumSeconds * DRUM_REPEATS;
  return [
    // Peace: a park recording's birds and breeze, with a cleaner close bird track over its first half.
    await buildLoop("ambience-peace", "ambience", [
      clip("parkBirds", null, 190, 190 + PEACE_LENGTH + LOOP_CROSSFADE, { filter: "highpass=f=150" }),
      clip("birds", null, 0, 30.6, { at: 6, filter: "highpass=f=400", gain: -18 }),
    ], PEACE_LENGTH, LOOP_CROSSFADE),
    // War: far-off clamour over the war drums, muffled so it sits behind the battle on screen.
    // One extra drum pass covers the seam crossfade; the bed repeats exactly, so it fades into itself.
    await buildLoop("ambience-war", "ambience", warTexture(warSeconds), warSeconds, LOOP_CROSSFADE, {
      source: "drums", loops: DRUM_REPEATS, gain: -5, filter: "lowpass=f=1400,aecho=0.8:0.6:80|150:0.3|0.2",
    }),
    // The theme from its first note to its final chord's decay; the short seam only hides the wrap's click.
    await buildLoop("music-battle", "music", [clip("battle", null, 0.2, 72.55)], 72.3, 0.03),
  ];
}

// --- Main ----------------------------------------------------------------------------------

mkdirSync(cache, { recursive: true });
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });
for (const stale of readdirSync(out)) if (stale.endsWith(".mp3") || stale === LOOP_MANIFEST) rmSync(join(out, stale));

const built = [];
for (const sound of ONE_SHOTS) built.push(...(await buildOneShot(sound)));
const loops = await buildLoops();
built.push(...loops.map((loop) => loop.file));
// Loop windows in seconds of the decoded file, for AudioBufferSourceNode.loopStart and loopEnd.
const manifest = join(out, LOOP_MANIFEST);
writeFileSync(manifest, `${JSON.stringify(Object.fromEntries(loops.map((loop) => [loop.name, loop.window])), null, 2)}\n`);
built.push(manifest);
rmSync(work, { recursive: true, force: true });

let total = 0;
for (const file of built) {
  const size = statSync(file).size;
  total += size;
  console.log(`${(size / 1024).toFixed(0).padStart(6)} KB  audio/${basename(file)}`);
}
console.log(`${(total / 1024).toFixed(0).padStart(6)} KB  total (${built.length} files)`);
