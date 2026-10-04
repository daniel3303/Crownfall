namespace Crownfall.Sim.Content;

/// <summary>Per-level stat growth for heroes; the curve makes every level add more than the one before.</summary>
public sealed class GrowthDef
{
    public float Hp { get; set; }
    public float Attack { get; set; }

    /// <summary>Extra share of the per-level amount each further level adds: 0 is linear.</summary>
    public float Curve { get; set; }

    /// <summary>What a per-level amount totals by a level.</summary>
    public float Total(float perLevel, int level)
    {
        var levels = Math.Max(0, level - 1);
        return perLevel * levels * (1 + Curve * levels);
    }
}
