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
    public HeroStatsView Stats { get; init; }
}
