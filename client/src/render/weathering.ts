import type { Material } from "@babylonjs/core/Materials/material";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";

/** Share of the palette's saturation kept: the flat KayKit colours sit closer to the photo-scanned ground. */
const SATURATION = 0.78;
const BRIGHTNESS = 0.94;

/**
 * Tones a flat-palette StandardMaterial toward the realistic scene: less saturated, slightly darker, with a faint
 * grime of world-space noise so large single-colour faces stop reading as plastic.
 */
export function weather(material: Material): void {
  new WeatheringPlugin(material);
}

class WeatheringPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, "Weathering", 100, { WEATHERING: false });
    this._enable(true);
  }

  override getClassName(): string {
    return "WeatheringPlugin";
  }

  override isCompatible(shaderLanguage: number): boolean {
    return shaderLanguage === 0;
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines["WEATHERING"] = true;
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef WEATHERING
float weatherHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float weatherNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(weatherHash(i), weatherHash(i + vec3(1.0, 0.0, 0.0)), u.x), mix(weatherHash(i + vec3(0.0, 1.0, 0.0)), weatherHash(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
    mix(mix(weatherHash(i + vec3(0.0, 0.0, 1.0)), weatherHash(i + vec3(1.0, 0.0, 1.0)), u.x), mix(weatherHash(i + vec3(0.0, 1.0, 1.0)), weatherHash(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
    u.z);
}
#endif
`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
#ifdef WEATHERING
        float weatherLuma = dot(baseColor.rgb, vec3(0.3, 0.59, 0.11));
        float weatherGrime = weatherNoise(vPositionW * 9.0) * 0.6 + weatherNoise(vPositionW * 2.3) * 0.4;
        baseColor.rgb = mix(vec3(weatherLuma), baseColor.rgb, ${SATURATION.toFixed(2)}) * (${BRIGHTNESS.toFixed(2)} * (0.9 + 0.14 * weatherGrime));
#endif
`,
    };
  }
}
