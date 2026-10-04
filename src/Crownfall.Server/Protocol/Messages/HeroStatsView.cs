namespace Crownfall.Server.Protocol.Messages;

/// <summary>A hero's effective numbers right now, with level growth, stat ranks, items, Rally and the dragon buff applied.</summary>
public sealed class HeroStatsView
{
    public float Hp { get; init; }
    public float MaxHp { get; init; }
    public float Attack { get; init; }

    /// <summary>Seconds between basic attacks.</summary>
    public float Cooldown { get; init; }

    public float Range { get; init; }
    public float Speed { get; init; }
    public float ArmorMelee { get; init; }
    public float ArmorPierce { get; init; }

    /// <summary>Share of basic-attack damage healed back, 0 to 1.</summary>
    public float LifeSteal { get; init; }

    public int Sight { get; init; }

    /// <summary>Hp regained per second right now: items always, plus the resting share once unhurt for a while.</summary>
    public float Regen { get; init; }

    /// <summary>True while the hero is below full health and some regeneration applies.</summary>
    public bool Regenerating { get; init; }
}
