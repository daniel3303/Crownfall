namespace Crownfall.Server.Matches;

/// <summary>What <see cref="MatchStatsRecorder"/> has seen of one player so far.</summary>
public sealed class PlayerTally
{
    public List<int> Army { get; } = [];
    public List<int> Gathered { get; } = [];
    public List<int> Score { get; } = [];
    public int SoldiersTrained { get; set; }
    public int HeroKills { get; set; }
    public int HeroDeaths { get; set; }
}
