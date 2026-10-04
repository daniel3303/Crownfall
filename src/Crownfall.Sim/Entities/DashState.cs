using System.Numerics;
using Crownfall.Sim.Content;

namespace Crownfall.Sim.Entities;

/// <summary>A hero rushing to a point; every enemy it passes is hit once, unless the dash neither damages nor stuns.</summary>
public sealed class DashState
{
    public AbilityDef Ability { get; init; }
    public Vector2 Target { get; init; }
    public float Damage { get; init; }

    /// <summary>Reach of the hits around the hero, with the caster's talents applied.</summary>
    public float Radius { get; init; }

    /// <summary>Seconds each enemy hit is stunned.</summary>
    public float Stun { get; init; }
    public HashSet<int> Hits { get; } = [];
}
