namespace Crownfall.Server.Protocol.Messages;

/// <summary>Per-player HUD state, sent a few times a second.</summary>
public sealed class StateMessage : ServerMessage
{
    public override string T => "state";
    public int Tick { get; init; }
    public int ElapsedSeconds { get; init; }
    public int[] Resources { get; init; } = [];

    /// <summary>Storage cap per resource; income past it is lost.</summary>
    public int[] Storage { get; init; } = [];

    /// <summary>The viewer's best completed town center level, which gates some upgrades; 0 without one.</summary>
    public int TownCenterLevel { get; init; }

    public MarketView Market { get; init; }
    public int Population { get; init; }
    public int PopulationCap { get; init; }
    public HeroView Hero { get; init; }

    /// <summary>Null on a map without a dragon.</summary>
    public DragonView Dragon { get; init; }

    public List<ProductionView> Production { get; init; } = [];
    public List<PlayerView> Players { get; init; } = [];
}
