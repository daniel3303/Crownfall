using System.Numerics;

namespace Crownfall.Sim.Bots;

/// <summary>An enemy meteor strike whose cast the team saw, until it lands.</summary>
public sealed class KnownStrike
{
    public Vector2 Point { get; init; }
    public float Radius { get; init; }
    public int ImpactTick { get; init; }
}
