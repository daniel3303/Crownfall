namespace Crownfall.Sim.Content;

/// <summary>A building's ranged attack.</summary>
public sealed class AttackDef
{
    public float Damage { get; set; }
    public DamageType DamageType { get; set; }
    public float Range { get; set; }
    public float Cooldown { get; set; }
}
