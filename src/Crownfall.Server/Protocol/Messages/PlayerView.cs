namespace Crownfall.Server.Protocol.Messages;

public sealed class PlayerView
{
    public int Index { get; init; }
    public string Name { get; init; }
    public int Team { get; init; }
    public string Race { get; init; }
    public bool IsBot { get; init; }
    public bool Defeated { get; init; }
    public int Score { get; init; }
}
