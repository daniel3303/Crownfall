namespace Crownfall.Sim.Entities;

/// <summary>An arrow in flight. Damage is fixed at launch and lands on the target at the impact tick.</summary>
public sealed class Projectile
{
    public Entity Source { get; init; }
    public Player SourceOwner { get; init; }
    public Entity Target { get; init; }
    public float Damage { get; init; }
    public int ImpactTick { get; init; }
}
