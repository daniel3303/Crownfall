import { Constants } from "@babylonjs/core/Engines/constants";
import type { Material } from "@babylonjs/core/Materials/material";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { Scene } from "@babylonjs/core/scene";
import type { FogGrid } from "../game/vision";

const VISIBLE = 255;
const EXPLORED = 110;

/** One R8 texture of the viewer's fog, sampled by world XZ in every fogged material. */
export class FogOfWar {
  readonly texture: RawTexture;
  private readonly data: Uint8Array;
  private version = -1;

  constructor(
    scene: Scene,
    private readonly grid: FogGrid,
  ) {
    this.data = new Uint8Array(grid.width * grid.height);
    this.texture = RawTexture.CreateRTexture(this.data, grid.width, grid.height, scene, false, false, Texture.BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
    this.texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  }

  get width(): number {
    return this.grid.width;
  }

  get height(): number {
    return this.grid.height;
  }

  /** Re-uploads only when a new snapshot changed the grid. */
  sync(): void {
    if (this.version === this.grid.version) return;
    this.version = this.grid.version;
    const { visible, explored } = this.grid;
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] = visible[i] ? VISIBLE : explored[i] ? EXPLORED : 0;
    }
    this.texture.update(this.data);
  }

  apply(material: Material): void {
    new FogOfWarPlugin(material, this);
  }
}

class FogOfWarPlugin extends MaterialPluginBase {
  constructor(
    material: Material,
    private readonly fog: FogOfWar,
  ) {
    super(material, "FogOfWar", 200, { FOG_OF_WAR: false });
    this._enable(true);
  }

  override getClassName(): string {
    return "FogOfWarPlugin";
  }

  override isCompatible(shaderLanguage: number): boolean {
    return shaderLanguage === 0;
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines["FOG_OF_WAR"] = true;
  }

  override getSamplers(samplers: string[]): void {
    samplers.push("fogOfWarSampler");
  }

  override getUniforms() {
    return {
      ubo: [{ name: "fogMapSize", size: 2, type: "vec2" }],
      fragment: "#ifdef FOG_OF_WAR\nuniform vec2 fogMapSize;\n#endif\n",
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat2("fogMapSize", this.fog.width, this.fog.height);
    uniformBuffer.setTexture("fogOfWarSampler", this.fog.texture);
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== "fragment") return null;
    // PBR materials name their final colour finalColor; standard materials call it color.
    const pbr = this._material.getClassName() === "PBRMaterial";
    const out = pbr ? "finalColor" : "color";
    // Photo-scanned PBR albedo is darker than the stylised palette, so its unexplored shade is lifted to match.
    const hiddenGain = pbr ? "1.35" : "1.0";
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: "#ifdef FOG_OF_WAR\nuniform sampler2D fogOfWarSampler;\n#endif\n",
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef FOG_OF_WAR
        vec2 fogUv = vec2(vPositionW.x / fogMapSize.x, -vPositionW.z / fogMapSize.y);
        // Beyond the map edge is unexplored void, not a copy of the edge texel.
        float fogInside = step(0.0, fogUv.x) * step(fogUv.x, 1.0) * step(0.0, fogUv.y) * step(fogUv.y, 1.0);
        float fogValue = texture2D(fogOfWarSampler, fogUv).r * fogInside;
        vec3 fogGrey = vec3(dot(${out}.rgb, vec3(0.3, 0.59, 0.11)));
        float fogSeen = smoothstep(0.43, 0.95, fogValue);
        float fogKnown = smoothstep(0.0, 0.43, fogValue);
        // Explored ground keeps some colour under a cool shade; unexplored stays readable; off-map is near black.
        vec3 fogExplored = mix(fogGrey, ${out}.rgb, 0.45) * vec3(0.64, 0.67, 0.76);
        vec3 fogHidden = fogGrey * mix(vec3(0.08, 0.09, 0.11), vec3(0.27, 0.29, 0.35) * ${hiddenGain}, fogInside);
        ${out}.rgb = mix(fogHidden, mix(fogExplored, ${out}.rgb, fogSeen), fogKnown);
#endif
`,
    };
  }
}
