namespace Crownfall.Server.Protocol.Messages;

public sealed class EndPlayerView
{
    public int Index { get; init; }
    public string Name { get; init; }
    public int Team { get; init; }
    public bool IsBot { get; init; }

    /// <summary>Unit id of the player's hero.</summary>
    public string Hero { get; init; }
    public int Score { get; init; }
    public int Gathered { get; init; }
    public int Kills { get; init; }
    public int Losses { get; init; }
    public int UnitsTrained { get; init; }
    public int HeroLevel { get; init; }

    /// <summary>Soldiers trained, villagers excluded.</summary>
    public int SoldiersTrained { get; init; }

    public int BuildingsBuilt { get; init; }
    public int HeroKills { get; init; }
    public int HeroDeaths { get; init; }
}
