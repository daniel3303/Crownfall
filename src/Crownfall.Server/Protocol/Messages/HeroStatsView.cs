namespace Crownfall.Server.Protocol.Messages;

/// <summary>A hero's effective numbers right now, with level growth, stat ranks and any Rally buff applied.</summary>
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

    /// <summary>Hp regained per second while resting.</summary>
    public float Regen { get; init; }

    /// <summary>True while the hero has gone unhurt long enough to be regenerating.</summary>
    public bool Regenerating { get; init; }
}
