using System.Numerics;
using Crownfall.Sim.Content;

namespace Crownfall.Sim.Entities;

/// <summary>A delayed area attack from a hero ability.</summary>
public sealed class PendingStrike
{
    public Player Owner { get; init; }
    public Unit Caster { get; init; }
    public AbilityDef Ability { get; init; }
    public Vector2 Point { get; init; }
    public float Damage { get; init; }
    public int ImpactTick { get; init; }
}
