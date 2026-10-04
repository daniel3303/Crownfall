namespace Crownfall.Server.Protocol.Messages;

public sealed class EndPlayerView
{
    public int Index { get; init; }
    public string Name { get; init; }
    public int Team { get; init; }
    public bool IsBot { get; init; }
    public int Score { get; init; }
    public int Gathered { get; init; }
    public int Kills { get; init; }
    public int Losses { get; init; }
    public int UnitsTrained { get; init; }
    public int HeroLevel { get; init; }
}
