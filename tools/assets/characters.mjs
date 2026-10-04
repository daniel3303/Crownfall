// Builds client/public/assets/units/<id>.glb from CC0 Quaternius packs: realistic-proportion humans composed from the
// Modular Character Outfits (Regular body) with a Universal Base Characters head and hair, held weapons and armour from
// Quaternius' CC0 models on Poly Pizza, animated with the Universal Animation Library; a Quaternius wolf for the creeps
// and a Quaternius dragon for the boss; the knight rides a Quaternius horse.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { attachedParts, bakeVertexColors, buildAtlas, concat, crossbowParts, fingerPose, lastPose, ownClip, readDoc, retarget, Rig, rigidParts, shapeParts, simplifierReady, simplify, skinnedParts, transferWeights, weldPositions, writeCharacter } from "./character-kit.mjs";
import { layer, mountRig, onlyJoints, Pose, poseClip, smoothNormals, stillFrame } from "./character-poses.mjs";
import { itchUpload } from "./itch.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(here, ".cache");
const out = join(here, "../../client/public/assets/units");

/** Free ("Standard") itch.io uploads and the zip entries the build reads. */
const ITCH = {
  ubc: { slug: "universal-base-characters", file: "Universal Base Characters[Standard].zip", entries: ["*/Base Characters/Godot - UE/*", "*/Hairstyles/Rigged to Head Bone/*"] },
  outfits: { slug: "modular-character-outfits-fantasy", file: "Modular Character Outfits - Fantasy[Standard].zip", entries: ["*/Exports/glTF (Godot-Unreal)/Outfits/*", "*/Textures/Peasant/*"] },
  ual1: { slug: "universal-animation-library", file: "Universal Animation Library[Standard].zip", entries: ["*/Unreal-Godot/UAL1_Standard.glb"] },
  ual2: { slug: "universal-animation-library-2", file: "Universal Animation Library 2[Standard].zip", entries: ["*/Unreal-Godot/UAL2_Standard.glb"] },
};

/** Quaternius' CC0 models on Poly Pizza (page id → model file), all but the wolf, dragon and horse static props. */
const POLY = {
  wolf: ["P1gU3Qkr9r", "f1d12388-e39b-4157-b32a-646a1d089fc4"],
  dragon: ["VBvzjFIYws", "9714f533-5d2d-4cfd-b8f1-c8dfff64a672"],
  whiteHorse: ["bEdE4rmZy9", "3edc2bd9-3378-4b43-a50d-d5e1f858562b"],
  sword: ["9lLmH8Et4K", "65837148-8c3c-42d5-9ce7-c55f9295cc7e"],
  armorMetal: ["TMUoxILh9w", "60ccfcdb-6aa7-4caf-a688-9b16a2a5f300"],
  heaterShield: ["srN1KGAO7f", "60cc7b8e-0589-4f4b-a354-f6fef73a44bd"],
  roundShield: ["lWajrVXcnA", "f0c77485-abcd-47ed-8fab-5b5130a25f85"],
  spear: ["fH1zmvjPNx", "85591d23-e537-4562-8b28-80c30c0e696d"],
  greatsword: ["ajOJ2NLz5m", "35ab81c3-8780-4bef-a3c5-a9fbba01141b"],
  battleAxe: ["W0UYZPYSXf", "2b206f9f-30f7-43a4-8dd8-daa04953962b"],
  axe: ["xEhKbBI0Yp", "621ff071-2e11-45d5-ade1-0214b143676f"],
  hatchet: ["o54NXjRI4V", "654d4ee5-e217-4c23-b8e1-92e16226b21a"],
  hammer: ["UIXvQ73DS1", "97f342bf-7e3b-4155-a306-91b35e321c7b"],
};

async function itchDir(key) {
  const { slug, file, entries } = ITCH[key];
  const zip = await itchUpload(cache, "quaternius", slug, file);
  const dir = join(cache, "itch", slug, "files");
  // The stamp re-extracts when the zip or the entry list changes.
  const stamp = JSON.stringify({ size: statSync(zip).size, mtime: statSync(zip).mtimeMs, entries });
  if (!existsSync(join(dir, ".stamp")) || readFileSync(join(dir, ".stamp"), "utf8") !== stamp) {
    rmSync(`${dir}.part`, { recursive: true, force: true });
    execFileSync("unzip", ["-oq", zip, ...entries, "-d", `${dir}.part`]);
    writeFileSync(join(`${dir}.part`, ".stamp"), stamp);
    rmSync(dir, { recursive: true, force: true });
    renameSync(`${dir}.part`, dir);
  }
  return dir;
}

async function polyModel(key) {
  const [, model] = POLY[key];
  const file = join(cache, "polypizza", `${model}.glb`);
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    const response = await fetch(`https://static.poly.pizza/${model}.glb`);
    if (!response.ok) throw new Error(`Poly Pizza ${key} answered ${response.status}`);
    writeFileSync(`${file}.part`, Buffer.from(await response.arrayBuffer()));
    renameSync(`${file}.part`, file);
  }
  return readDoc(file);
}

// ---------------------------------------------------------------------------------------------------------------
// Composition rules

/** Triangle budgets per source part (by name), so the whole unit stays near 6k triangles. */
const BUDGET = [
  [/^SuperHero_Male#/, 700],
  [/^Eyes#/, 40],
  [/^Hair_Beard#/, 200],
  [/^Hair_/, 300],
  [/_Arms#0/, 560],
  [/_Arms#1/, 360],
  [/_Arms_Bracer#/, 200],
  [/_Body#/, 900],
  [/_Body_Belt/, 70],
  [/_Legs#/, 380],
  [/_Feet/, 380],
  [/_Hood#/, 380],
  [/_Pauldron#/, 180],
];

function budgetOf(part, overrides = {}) {
  for (const [pattern, limit] of Object.entries(overrides)) if (part.name.startsWith(pattern)) return limit;
  return BUDGET.find(([pattern]) => pattern.test(part.name))?.[1] ?? 500;
}

const weightOn = (influences, names) => influences.reduce((sum, [name, w]) => sum + (names.includes(name) ? w : 0), 0);
/** The Superhero head and neck, grafted onto the outfits' body, which only lack a head. */
const headOnly = (triangle) => triangle.every((influences) => weightOn(influences, ["Head", "neck_01"]) >= 0.5);
const LEGS = ["thigh_l", "thigh_r", "calf_l", "calf_r", "foot_l", "foot_r", "ball_l", "ball_r"];
/** A bare body minus what trousers and boots cover. */
const withoutLegs = (triangle) => !triangle.every((influences) => weightOn(influences, LEGS) >= 0.5);

/** The ranger's green cloth (hood, sleeves, tunic, trousers) carries the team colour. */
const GREEN_CLOTH = { hue: [65, 170], minSat: 0.2 };
/** The raider's olive wool shirt (the peasant's second colourway) carries the team colour. */
const OLIVE_WOOL = { hue: [45, 110], minSat: 0.15, minValue: 0.18 };
/** The peasant's undyed linen shirt carries the team colour. */
const LINEN = { hue: [20, 70], minSat: 0.08, maxSat: 0.42, minValue: 0.5 };

/** Painted shield planks carry the team colour. */
const WOOD = { hue: [5, 50], minSat: 0.25 };

/** Grips in the bind (T) pose: right fist at the wrist joint, thumb along +Z, fingers along -X, palm down. */
const RIGHT_FIST = [-0.075, -0.025, 0];
const sword = (length, hold = 0.07) => ({ joint: "hand_r", axis: "y", flat: "x", dir: [0, 0, 1], up: [-1, 0, 0], at: RIGHT_FIST, length, hold });
const shieldOnForearm = (axis, flat, length) => ({ joint: "lowerarm_l", axis, flat, dir: [0, 0, 1], up: [0, 1, 0], at: [0.13, 0.075, 0], length, hold: 0.5 });

/** The hair textures are grey, made to be tinted. */
const BROWN_HAIR = [0.42, 0.3, 0.2];
const DARK_HAIR = [0.24, 0.19, 0.15];
const RED_HAIR = [0.55, 0.32, 0.18];
const FAIR_HAIR = [0.78, 0.64, 0.42];
const BLACK_HAIR = [0.16, 0.15, 0.14];
const GREY_HAIR = [0.45, 0.45, 0.43];
/** Hair: tinted, a little glossy, and marked so the client can vary its shade per unit. */
const HAIR = (tint) => ({ tint, density: 0.8, tone: "hair", roughness: 0.55, metallic: 0 });
/** Green-grey orc skin and blue-grey troll hide, dyed over the human skin so its shading stays. */
const ORC_SKIN = { color: [0.46, 0.56, 0.32], keep: 0.22 };
const TROLL_SKIN = { color: [0.42, 0.5, 0.5], keep: 0.15 };

async function buildHuman(spec, sources) {
  const { ubc, outfits, ual1, ual2 } = sources;
  const rigDoc = await readDoc(spec.rig === "superhero" ? ubc.body : outfits[spec.rig]);
  const rig = new Rig(rigDoc);
  const parts = [];
  // Dyed hides vary in brightness only: a human complexion shift would grey the orc's green and the troll's blue.
  const skinSurface = { dye: spec.skin, density: 1, tone: spec.skin ? "hide" : "skin" };
  for (const [outfit, meshes, surfaces] of spec.wear) {
    // A surface can swap in one of the outfit's other colour textures.
    const swapped = Object.fromEntries(Object.entries(surfaces).map(([name, s]) => [name, s.texture ? { ...s, image: readFileSync(outfits[s.texture]), key: s.texture } : s]));
    parts.push(...skinnedParts(await readDoc(outfits[outfit]), rig, { meshes, surfaces: { MI_Regular_Male: skinSurface, ...swapped } }));
  }
  const ubcDoc = await readDoc(ubc.body);
  if (spec.rig === "superhero") {
    parts.push(...skinnedParts(ubcDoc, rig, { meshes: ["SuperHero_Male"], keepTriangle: spec.bareLegs ? undefined : withoutLegs, surfaces: { MI_Superhero_Male: { ...skinSurface, density: 1 } } }));
  } else {
    // The face gets extra texels: it is what the eye goes to, even at a distance.
    parts.push(...skinnedParts(ubcDoc, rig, { meshes: ["SuperHero_Male"], keepTriangle: headOnly, surfaces: { MI_Superhero_Male: { ...skinSurface, density: 1.5 } } }));
  }
  parts.push(...skinnedParts(ubcDoc, rig, { meshes: ["Eyes"], surfaces: { MI_Eyes: { color: [0.12, 0.09, 0.07] } } }));
  for (const style of spec.hair?.styles ?? []) parts.push(...skinnedParts(await readDoc(ubc.hair(style)), rig, { meshes: [style], surfaces: { MI_Hair_1: HAIR(spec.hair.tint), MI_Hair_2: HAIR(spec.hair.tint) } }));
  const body = parts.filter((p) => /_Body#|SuperHero_Male#|_Arms#/.test(p.name));
  const props = [];
  for (const item of spec.hold ?? []) {
    let held = item.crossbow ? crossbowParts(rig, item.grip) : rigidParts(await polyModel(item.model), rig, { ...item.grip, name: item.model, tint: item.tint, team: item.team }).map(weldPositions);
    if (item.bend) transferWeights(held, body);
    // The item's budget is shared by its primitives in proportion to their size.
    const total = held.reduce((n, p) => n + p.indices.length / 3, 0);
    held = held.map((part) => simplify(part, Math.max(12, Math.round(((item.triangles ?? 300) * part.indices.length) / 3 / total))));
    props.push(...held);
  }
  const baked = await Promise.all(parts.map((part) => (part.surface.bake ? bakeVertexColors(part) : part)));
  const simplified = [...baked.map((part) => simplify(part, budgetOf(part, spec.budget))), ...props];
  if (process.env.PARTS) for (const p of simplified) console.log(`  ${spec.id} ${p.name.padEnd(36)} ${p.indices.length / 3}`);
  const clips = {};
  for (const [role, recipe] of Object.entries(spec.clips)) clips[role] = recipe({ ual1, ual2, rig });
  clips.Dead = lastPose(clips.Death);
  const restOverrides = fingerPose(ual1, "Sword_Idle");
  return { rig, parts: simplified, clips, restOverrides };
}

/** Clip recipes: one library clip, or several back to back. */
const ual = (library, ...names) => ({ ual1, ual2, rig }) => concat(...names.map((name) => retarget(library === 1 ? ual1 : ual2, name, rig)));

const LOCOMOTION = { Idle: ual(1, "Idle_Loop"), Move: ual(1, "Jog_Fwd_Loop"), Death: ual(1, "Death01") };
const HERO_CLIPS = {
  ...LOCOMOTION,
  Idle: ual(1, "Sword_Idle"),
  Attack: ual(1, "Sword_Attack"),
  Cast0: ual(2, "Sword_Regular_B", "Sword_Regular_B_Rec"),
  Cast1: ual(1, "Spell_Simple_Enter", "Spell_Simple_Exit"),
  Cast2: ual(2, "Sword_Dash"),
  Cast3: ual(1, "Spell_Simple_Shoot"),
};

const RANGER = ["Male_Ranger_Arms", "Male_Ranger_Body", "Male_Ranger_Body_Belt_1", "Male_Ranger_Body_Belt_2", "Male_Ranger_Legs", "Male_Ranger_Feet_Boots"];
const PEASANT = ["Male_Peasant_Arms", "Male_Peasant_Body", "Male_Peasant_Legs", "Male_Peasant_Feet"];
/** Strappy leather pieces keep their colour in vertices so they can be simplified across their many UV islands. */
const STRAPS = Object.fromEntries(["Male_Ranger_Feet_Boots", "Male_Ranger_Arms_Bracer", "Male_Ranger_Body_Belt_1", "Male_Ranger_Body_Belt_2", "Male_Ranger_Acc_Pauldron"].map((name) => [name, { bake: true }]));
const rangerCloth = { MI_Ranger: { team: GREEN_CLOTH }, ...STRAPS };

const HUMANS = [
  {
    id: "villager",
    rig: "peasant",
    wear: [["peasant", PEASANT, { MI_Peasant: { team: LINEN } }]],
    hair: { styles: ["Hair_SimpleParted"], tint: BROWN_HAIR },
    hold: [{ model: "hatchet", grip: { ...sword(0.62, 0.12), flat: "x" } }],
    clips: { ...LOCOMOTION, Attack: ual(2, "Sword_Regular_A", "Sword_Regular_A_Rec"), Work: ual(2, "TreeChopping_Loop"), Harvest: ual(2, "Farm_Harvest") },
  },
  {
    id: "spearman",
    rig: "ranger",
    wear: [["ranger", RANGER, rangerCloth]],
    hair: { styles: ["Hair_Buzzed"], tint: DARK_HAIR },
    hold: [
      { model: "spear", grip: { joint: "hand_r", axis: "y", flat: "x", dir: [0, 0, 1], up: [-1, 0, 0], at: RIGHT_FIST, length: 2.1, hold: 0.32 } },
      { model: "heaterShield", grip: shieldOnForearm("y", "z", 0.78), team: WOOD },
      { model: "armorMetal", grip: { joint: "spine_03", axis: "y", flat: "z", dir: [0, 1, 0], up: [0, 0, 1], at: [0, 0.07, 0.01], length: 0.52, hold: 0.5 }, bend: true, triangles: 600 },
    ],
    clips: { ...LOCOMOTION, Idle: ual(2, "Idle_Shield_Loop"), Attack: ual(2, "Sword_Regular_B", "Sword_Regular_B_Rec") },
  },
  {
    id: "archer",
    rig: "ranger",
    wear: [["ranger", [...RANGER, "Male_Ranger_Head_Hood", "Male_Ranger_Arms_Bracer"], rangerCloth]],
    hold: [{ crossbow: true, grip: { joint: "hand_r", axis: "y", flat: "x", dir: [-1, 0, 0], up: [0, 1, 0], at: [-0.08, -0.02, 0.06], length: 0.62, hold: 0.22 } }],
    clips: { ...LOCOMOTION, Idle: ual(1, "Pistol_Idle_Loop"), Attack: ual(1, "Pistol_Shoot", "Pistol_Reload") },
  },
  {
    id: "rider",
    rig: "peasant",
    wear: [
      ["peasant", ["Male_Peasant_Arms", "Male_Peasant_Body", "Male_Peasant_Legs"], { MI_Peasant: { team: OLIVE_WOOL, texture: "peasant2" } }],
      ["ranger", ["Male_Ranger_Feet_Boots", "Male_Ranger_Acc_Pauldron", "Male_Ranger_Body_Belt_1"], STRAPS],
    ],
    hair: { styles: ["Hair_Long", "Hair_Beard"], tint: RED_HAIR },
    hold: [
      { model: "axe", grip: { ...sword(0.8, 0.1) } },
      { model: "roundShield", grip: shieldOnForearm("y", "z", 0.62), team: WOOD },
    ],
    clips: { ...LOCOMOTION, Idle: ual(1, "Sword_Idle"), Attack: ual(2, "Sword_Regular_A", "Sword_Regular_A_Rec") },
  },
  {
    id: "paladin",
    rig: "ranger",
    wear: [["ranger", [...RANGER, "Male_Ranger_Arms_Bracer"], rangerCloth]],
    hair: { styles: ["Hair_SimpleParted", "Hair_Beard"], tint: FAIR_HAIR },
    hold: [
      { model: "greatsword", grip: sword(1.35, 0.06) },
      { model: "armorMetal", grip: { joint: "spine_03", axis: "y", flat: "z", dir: [0, 1, 0], up: [0, 0, 1], at: [0, 0.07, 0.01], length: 0.56, hold: 0.5 }, bend: true, triangles: 600 },
    ],
    clips: HERO_CLIPS,
  },
  {
    id: "warchief",
    rig: "superhero",
    skin: ORC_SKIN,
    wear: [
      ["peasant", ["Male_Peasant_Legs"], { MI_Peasant: { team: true } }],
      ["ranger", ["Male_Ranger_Feet_Boots", "Male_Ranger_Acc_Pauldron", "Male_Ranger_Body_Belt_1", "Male_Ranger_Arms_Bracer"], STRAPS],
    ],
    hair: { styles: ["Hair_Long", "Hair_Beard"], tint: BLACK_HAIR },
    hold: [{ model: "battleAxe", grip: { ...sword(1.3, 0.08), flat: "-x" } }],
    budget: { "SuperHero_Male#": 2200 },
    clips: HERO_CLIPS,
  },
  {
    id: "troll",
    rig: "superhero",
    skin: TROLL_SKIN,
    bareLegs: true,
    wear: [],
    hair: { styles: ["Hair_Beard"], tint: GREY_HAIR },
    hold: [{ model: "hammer", grip: { ...sword(1.5, 0.08) } }],
    budget: { "SuperHero_Male#": 2600 },
    clips: { ...LOCOMOTION, Idle: ual(2, "Zombie_Idle_Loop"), Move: ual(2, "Zombie_Walk_Fwd_Loop"), Attack: ual(1, "Sword_Attack") },
  },
];

async function buildWolf() {
  const doc = await polyModel("wolf");
  const rig = new Rig(doc);
  // Quaternius' grey coat, toned toward a brown timber wolf.
  const coat = { tint: [0.85, 0.78, 0.68] };
  const parts = skinnedParts(doc, rig, { meshes: ["Wolf"], surfaces: { Main: coat, Main_Light: coat } });
  const clips = { Idle: ownClip(doc, "Idle", rig), Move: ownClip(doc, "Gallop", rig), Attack: ownClip(doc, "Attack", rig), Death: ownClip(doc, "Death", rig) };
  clips.Dead = lastPose(clips.Death);
  return { rig, parts, clips };
}

/** The boss: Quaternius' faceted dragon, smoothed and recoloured from near-black maroon to crimson scales on a bone belly. */
async function buildDragon() {
  const doc = await polyModel("dragon");
  const rig = new Rig(doc);
  const surfaces = {
    Main: { color: [0.42, 0.09, 0.07], material: { roughness: 0.5, metallic: 0 } },
    Belly: { color: [0.74, 0.58, 0.32], material: { roughness: 0.6, metallic: 0 } },
    Claws: { color: [0.16, 0.14, 0.13], material: { roughness: 0.35, metallic: 0 } },
    Wings: { color: [0.24, 0.07, 0.06], material: { roughness: 0.7, metallic: 0 } },
    Eyes: { color: [0.12, 0.03, 0.02], material: { roughness: 0.15, metallic: 0 } },
  };
  // One vertex per face corner: smoothing reads as scales over a body rather than paper facets.
  const parts = [...skinnedParts(doc, rig, { meshes: ["Dragon"], surfaces }).map((part) => smoothNormals(part, 60)), ...attachedParts(doc, rig, { meshes: ["Eyes"], surfaces })];
  const clip = (name) => ownClip(doc, `DragonArmature|${name}`, rig);
  // It has no ground gait: it hovers, flying in place when idle and on the move.
  const clips = { Idle: clip("Dragon_Flying"), Move: clip("Dragon_Flying"), Attack: clip("Dragon_Attack"), Death: clip("Dragon_Death") };
  clips.Dead = lastPose(clips.Death);
  return { rig, parts, clips };
}

/** The rider's size against the horse's model units, and where its pelvis sits on the horse's back (horse space). */
const RIDER_SCALE = 2.25;
const SADDLE = [0, 3.42, -0.1];
const LEG_JOINTS = ["thigh_l", "calf_l", "foot_l", "ball_l", "thigh_r", "calf_r", "foot_r", "ball_r"];
/** A grip made for a rider on foot, scaled onto the mounted rig. */
const mounted = (grip) => ({ ...grip, at: grip.at.map((v) => v * RIDER_SCALE), length: grip.length * RIDER_SCALE });

/** A closed great helm in head-joint space (rider units): a rounded drum over the whole head, an eye slit, a team crest. */
const STEEL = [0.55, 0.56, 0.58];
const GREAT_HELM = [
  { lathe: [[0.245, 0, 0], [0.242, 0.07, 0.085], [0.23, 0.098, 0.118], [0.2, 0.107, 0.127], [0.1, 0.108, 0.13], [0, 0.104, 0.126], [-0.045, 0.1, 0.12]], color: STEEL, finish: { roughness: 0.35, metallic: 1 } },
  { box: [[0, 0.1, 0.13], [0.078, 0.009, 0.012]], color: [0.04, 0.04, 0.04], finish: { roughness: 0.9, metallic: 0 } },
  { box: [[0, 0.04, 0.13], [0.008, 0.05, 0.01]], color: STEEL, finish: { roughness: 0.35, metallic: 1 } },
  { box: [[0, 0.27, 0], [0.012, 0.03, 0.1]], color: [0.5, 0.5, 0.5], finish: { roughness: 0.8, metallic: 0 }, team: true },
];

/** A team-coloured cloth over the horse's back and flanks under a leather saddle (horse space). */
const SADDLE_CLOTH = [
  { box: [[0.53, 2.92, -0.1], [0.02, 0.46, 0.66], 0.25], color: [0.5, 0.5, 0.5], finish: { roughness: 0.85, metallic: 0 }, team: true },
  { box: [[-0.53, 2.92, -0.1], [0.02, 0.46, 0.66], -0.25], color: [0.5, 0.5, 0.5], finish: { roughness: 0.85, metallic: 0 }, team: true },
  { box: [[0, 3.43, -0.05], [0.4, 0.03, 0.42]], color: [0.3, 0.18, 0.1], finish: { roughness: 0.6, metallic: 0 } },
];

/** Heavy cavalry: an armoured knight with sword and shield on Quaternius' white horse, one skeleton for both. */
async function buildKnight({ ubc, outfits, ual1, ual2 }) {
  const horseDoc = await polyModel("whiteHorse");
  const riderDoc = await readDoc(outfits.ranger);
  const { rig, riderTop, riderJoints } = mountRig(horseDoc, riderDoc, { joint: "Torso2", seat: SADDLE, scale: RIDER_SCALE, prefix: "Horse_" });
  // Riding legs: thighs forward and out round the barrel, calves down along the flank.
  const pose = new Pose(rig);
  for (const [side, x] of [["l", 1], ["r", -1]]) pose.aim(`thigh_${side}`, `calf_${side}`, [x * 0.5, -0.7, 1.0]).aim(`calf_${side}`, `foot_${side}`, [x * 0.12, -1, -0.45]);
  const legs = pose.locals();
  const seated = new Set([riderTop, "pelvis", ...LEG_JOINTS]);
  // The rider's clips move its upper body only; the horse carries the rest.
  const upper = (library, ...names) => onlyJoints(concat(...names.map((name) => retarget(library, name, rig))), (joint) => riderJoints.has(joint) && !seated.has(joint)).filter((c) => c.path === "rotation");
  const horse = (name) => ownClip(horseDoc, name, rig);
  const ready = stillFrame(upper(ual1, "Sword_Idle"));
  const sit = stillFrame(poseClip(legs, 0));
  const clips = {
    Idle: layer(horse("Idle"), ready, sit),
    Move: layer(horse("Gallop"), ready, sit),
    Attack: layer(stillFrame(horse("Idle")), upper(ual2, "Sword_Regular_A", "Sword_Regular_A_Rec"), sit),
    Death: layer(horse("Death"), ready, sit),
  };
  clips.Dead = lastPose(clips.Death);

  // The white horse's grey-white coat, smoothed: its facets read as paper beside the rider.
  const parts = skinnedParts(horseDoc, rig, { meshes: ["Horse"] }).map((part) => smoothNormals(part, 60));
  const rider = ["Male_Ranger_Arms", "Male_Ranger_Body", "Male_Ranger_Body_Belt_1", "Male_Ranger_Legs", "Male_Ranger_Feet_Boots", "Male_Ranger_Arms_Bracer", "Male_Ranger_Acc_Pauldron"];
  parts.push(...skinnedParts(riderDoc, rig, { meshes: rider, surfaces: { MI_Regular_Male: { density: 1, tone: "skin" }, ...rangerCloth } }));
  // The head only fills the helm's neck opening.
  parts.push(...skinnedParts(await readDoc(ubc.body), rig, { meshes: ["SuperHero_Male"], keepTriangle: headOnly, surfaces: { MI_Superhero_Male: { density: 0.5, tone: "skin" } } }));
  const head = rig.position("Head");
  const helm = shapeParts(rig, { name: "GreatHelm", joint: "Head", origin: head, scale: RIDER_SCALE, shapes: GREAT_HELM });
  const cloth = shapeParts(rig, { name: "SaddleCloth", joint: "Torso2", origin: [0, 0, 0], shapes: SADDLE_CLOTH });
  const body = parts.filter((p) => /_Body#|_Arms#/.test(p.name));
  const held = async (model, grip, triangles, bend, team) => {
    let pieces = rigidParts(await polyModel(model), rig, { ...mounted(grip), name: model, team }).map(weldPositions);
    if (bend) transferWeights(pieces, body);
    const total = pieces.reduce((n, p) => n + p.indices.length / 3, 0);
    return pieces.map((part) => simplify(part, Math.max(12, Math.round((triangles * part.indices.length) / 3 / total))));
  };
  const props = [
    ...(await held("sword", sword(0.95, 0.1), 260)),
    ...(await held("heaterShield", shieldOnForearm("y", "z", 0.78), 300, false, WOOD)),
    ...(await held("armorMetal", { joint: "spine_03", axis: "y", flat: "z", dir: [0, 1, 0], up: [0, 0, 1], at: [0, 0.07, 0.01], length: 0.56, hold: 0.5 }, 500, true)),
  ];
  const baked = await Promise.all(parts.map((part) => (part.surface.bake ? bakeVertexColors(part) : part)));
  const budget = { "Horse#0": 1300, "SuperHero_Male#": 240, "Male_Ranger_Body#": 560, "Male_Ranger_Arms#": 300, "Male_Ranger_Legs#": 300, "Male_Ranger_Feet_Boots#": 240, "Male_Ranger_Acc_Pauldron#": 140, "Male_Ranger_Arms_Bracer#": 120 };
  const simplified = [...baked.map((part) => simplify(part, budgetOf(part, budget))), ...helm, ...cloth, ...props];
  if (process.env.PARTS) for (const p of simplified) console.log(`  knight ${p.name.padEnd(36)} ${p.indices.length / 3}`);
  return { rig, parts: simplified, clips, restOverrides: new Map([...fingerPose(ual1, "Sword_Idle"), ...legs]) };
}

async function sources() {
  const [ubcDir, outfitsDir, ual1Dir, ual2Dir] = await Promise.all(["ubc", "outfits", "ual1", "ual2"].map(itchDir));
  const ubcBase = join(ubcDir, "Universal Base Characters[Standard]");
  const outfitBase = join(outfitsDir, "Modular Character Outfits - Fantasy[Standard]");
  const outfitsGltf = join(outfitBase, "Exports/glTF (Godot-Unreal)/Outfits");
  return {
    ubc: { body: join(ubcBase, "Base Characters/Godot - UE/Superhero_Male_FullBody.gltf"), hair: (style) => join(ubcBase, "Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)", `${style}.gltf`) },
    outfits: { ranger: join(outfitsGltf, "Male_Ranger.gltf"), peasant: join(outfitsGltf, "Male_Peasant.gltf"), peasant2: join(outfitBase, "Textures/Peasant/T_Peasant_2_BaseColor.png") },
    ual1: await readDoc(join(ual1Dir, "Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb")),
    ual2: await readDoc(join(ual2Dir, "Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb")),
  };
}

export async function buildCharacters(only) {
  await simplifierReady;
  mkdirSync(out, { recursive: true });
  const src = await sources();
  const results = [];
  const jobs = [...HUMANS.map((spec) => [spec.id, () => buildHuman(spec, src)]), ["knight", () => buildKnight(src)], ["wolf", buildWolf], ["dragon", buildDragon]];
  for (const [id, build] of jobs) {
    if (only && !only.includes(id)) continue;
    const { rig, parts, clips, restOverrides } = await build();
    const atlas = await buildAtlas(parts);
    const file = join(out, `${id}.glb`);
    const { triangles } = await writeCharacter(file, { id, rig, parts, atlas, clips, restOverrides });
    results.push({ id, triangles, bytes: statSync(file).size });
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const only = process.argv.slice(2);
  const results = await buildCharacters(only.length ? only : undefined);
  let total = 0;
  for (const { id, triangles, bytes } of results) {
    total += bytes;
    console.log(`${(bytes / 1024).toFixed(0).padStart(6)} KB  ${String(triangles).padStart(5)} tris  units/${id}.glb`);
  }
  console.log(`${(total / 1024).toFixed(0).padStart(6)} KB  total`);
}
