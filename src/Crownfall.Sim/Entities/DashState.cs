using System.Numerics;
using Crownfall.Sim.Content;

namespace Crownfall.Sim.Entities;

/// <summary>A hero rushing to a point; every enemy it passes is hit once.</summary>
public sealed class DashState
{
    public AbilityDef Ability { get; init; }
    public Vector2 Target { get; init; }
    public float Damage { get; init; }
    public HashSet<int> Hits { get; } = [];
}
