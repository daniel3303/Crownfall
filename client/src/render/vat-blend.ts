import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";

/** Per-instance pose a unit fades out of: its first row, its row offset and its weight (vec4, w unused). */
export const VAT_BLEND = "vatBlend";
/** Shader define a material sets to declare VAT_BLEND and blend with it. */
export const VAT_BLEND_DEFINE = "VAT_BLEND";

const INFLUENCES = [
  ["matricesIndices[0]", "matricesWeights[0]", 0],
  ["matricesIndices[1]", "matricesWeights[1]", 1],
  ["matricesIndices[2]", "matricesWeights[2]", 2],
  ["matricesIndices[3]", "matricesWeights[3]", 3],
  ["matricesIndicesExtra[0]", "matricesWeightsExtra[0]", 4],
  ["matricesIndicesExtra[1]", "matricesWeightsExtra[1]", 5],
  ["matricesIndicesExtra[2]", "matricesWeightsExtra[2]", 6],
  ["matricesIndicesExtra[3]", "matricesWeightsExtra[3]", 7],
] as const;

function influence(target: string, frame: string): string {
  return INFLUENCES.map(([index, weight, n]) => {
    const line = `${target}${n === 0 ? "=" : "+="}readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture,${index},${frame})*${weight};`;
    return n === 0 ? line : `#if NUM_BONE_INFLUENCERS>${n}\n${line}\n#endif`;
  }).join("\n");
}

/**
 * Replaces Babylon's bakedVertexAnimation include: the settings carry the row the CPU picked (vat-clock.ts), not a clock.
 * Under VAT_BLEND (the unit material) it blends toward the next row by the offset's fraction and fades in the previous
 * clip's pose; shadow and depth passes show the plain row.
 */
const UNIT_VAT = `#ifdef BAKED_VERTEX_ANIMATION_TEXTURE
{
#ifdef INSTANCES
#define BVASNAME bakedVertexAnimationSettingsInstanced
#else
#define BVASNAME bakedVertexAnimationSettings
#endif
float VATRows=BVASNAME.y-BVASNAME.x+1.0;float VATRow=clamp(BVASNAME.z,0.0,VATRows-0.001);float VATInto=floor(VATRow);float VATFrameNum=BVASNAME.x+VATInto;mat4 VATInfluence;
${influence("VATInfluence", "VATFrameNum")}
#if defined(${VAT_BLEND_DEFINE}) && defined(INSTANCES)
float VATBetween=VATRow-VATInto;
if (VATBetween>0.0) {
float VATNextNum=VATInto+1.0>=VATRows ? BVASNAME.x : VATFrameNum+1.0;mat4 VATNextInfluence;
${influence("VATNextInfluence", "VATNextNum")}
VATInfluence=VATInfluence*(1.0-VATBetween)+VATNextInfluence*VATBetween;
}
if (${VAT_BLEND}.z>0.0) {
float VATBlendFrame=${VAT_BLEND}.x+floor(${VAT_BLEND}.y);mat4 VATBlendInfluence;
${influence("VATBlendInfluence", "VATBlendFrame")}
VATInfluence=VATInfluence*(1.0-${VAT_BLEND}.z)+VATBlendInfluence*${VAT_BLEND}.z;
}
#endif
finalWorld=finalWorld*VATInfluence;}
#endif
`;

// Registered at import, before any material compiles; Babylon's own module only fills the slot when it is empty.
ShaderStore.IncludesShadersStore["bakedVertexAnimation"] = UNIT_VAT;
