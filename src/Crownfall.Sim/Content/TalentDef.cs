namespace Crownfall.Sim.Content;

/// <summary>
/// A hero perk picked at a talent level. <see cref="Ability"/> names the kit ability its modifiers change; the stat
/// fields add to the hero like an item's do. The client words a talent from these numbers, so it has no description.
/// </summary>
public sealed class TalentDef
{
    public string Id { get; set; }
    public string Name { get; set; }
    public string Ability { get; set; }

    /// <summary>Share of extra damage, or extra healing, for <see cref="Ability"/>.</summary>
    public float AbilityDamage { get; set; }

    /// <summary>Seconds taken off <see cref="Ability"/>'s base cooldown, before level and item reduction.</summary>
    public float Cooldown { get; set; }

    public float Radius { get; set; }
    public float Range { get; set; }

    /// <summary>Seconds added to a buff's duration.</summary>
    public float Duration { get; set; }

    /// <summary>Seconds added to a dash's or strike's stun.</summary>
    public float Stun { get; set; }

    public float Hp { get; set; }
    public float Attack { get; set; }
    public ArmorDef Armor { get; set; } = new();
    public float AttackSpeed { get; set; }
    public float MoveSpeed { get; set; }
    public float LifeSteal { get; set; }
}
