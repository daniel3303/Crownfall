import { describe, expect, it } from "vitest";
import type { UnitDef } from "../src/content/content";
import { byModel, modelId } from "../src/render/unit-models";

const def = (id: string, model?: string) => ({ id, ...(model ? { model } : {}) }) as UnitDef;

describe("unit models", () => {
  it("draws a unit's own model unless it borrows another's", () => {
    expect(modelId(def("rider"))).toBe("rider");
    expect(modelId(def("knight", "rider"))).toBe("rider");
  });

  it("makes one entry per model, shared by the kinds that draw it", () => {
    const made: string[] = [];
    const { byKind, models } = byModel(
      [
        { kind: 3, def: def("rider") },
        { kind: 5, def: def("knight", "rider") },
        { kind: 6, def: def("wolf") },
      ],
      (id) => {
        made.push(id);
        return { id };
      },
    );
    expect(made).toEqual(["rider", "wolf"]);
    expect(models).toHaveLength(2);
    expect(byKind[5]).toBe(byKind[3]);
    expect(byKind[6]).not.toBe(byKind[3]);
    expect(byKind[4]).toBeUndefined();
  });
});
