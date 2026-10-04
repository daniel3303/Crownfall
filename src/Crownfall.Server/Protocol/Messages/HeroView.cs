namespace Crownfall.Server.Protocol.Messages;

/// <summary>The viewer's hero for the HUD: progress, banked points, live stats and, while fallen, the revive terms.</summary>
public sealed class HeroView
{
    public int Id { get; init; }
    public string Unit { get; init; }
    public int Level { get; init; }
    public int Xp { get; init; }
    public int XpLevelStart { get; init; }
    public int XpNextLevel { get; init; }
    public float[] Cooldowns { get; init; } = [];
    public int UnspentPoints { get; init; }

    /// <summary>Ranks per hero stat, in content order.</summary>
    public int[] Ranks { get; init; } = [];

    /// <summary>Seconds until a fallen hero may be revived; 0 when alive or ready.</summary>
    public float ReviveSeconds { get; init; }

    /// <summary>True when the hero is down, its cooldown is over and a completed town center stands.</summary>
    public bool CanRevive { get; init; }

    public int[] ReviveCost { get; init; } = [];

    /// <summary>Item id per inventory slot, null where a slot is empty.</summary>
    public string[] Items { get; init; } = [];

    /// <summary>True while the living hero stands near an own completed town center, where items are bought and sold.</summary>
    public bool CanShop { get; init; }

    /// <summary>Enemy heroes slain since the hero last died.</summary>
    public int Streak { get; init; }

    /// <summary>Picked talent id per tier, null where the tier is unpicked; the tiers open at <c>rules.heroTalentLevels</c>.</summary>
    public string[] Talents { get; init; } = [];

    /// <summary>What ability cooldowns are multiplied by now, from the hero's level and items.</summary>
    public float CooldownFactor { get; init; }

    public HeroStatsView Stats { get; init; }
}
