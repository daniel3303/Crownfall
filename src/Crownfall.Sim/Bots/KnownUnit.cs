using System.Numerics;
using Crownfall.Sim.Content;

namespace Crownfall.Sim.Bots;

/// <summary>An enemy soldier or hero as last seen.</summary>
public sealed class KnownUnit
{
    public int Id { get; init; }
    public UnitDef Def { get; init; }
    public int Owner { get; init; }
    public Vector2 Position { get; set; }
    public float Power { get; set; }

    /// <summary>Power at full health; a hero comes back with it when revived.</summary>
    public float FullPower { get; set; }

    public int LastSeenTick { get; set; }
}
