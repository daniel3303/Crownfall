namespace Crownfall.Server.Protocol.Messages;

public sealed class SeatView
{
    public int Index { get; init; }
    public int Team { get; init; }
    public string Name { get; init; }
    public string Race { get; init; }
    public bool IsBot { get; init; }
    public bool IsHost { get; init; }
}
