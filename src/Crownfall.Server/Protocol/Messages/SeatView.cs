namespace Crownfall.Server.Protocol.Messages;

public sealed class SeatView
{
    public int Index { get; init; }
    public int Team { get; init; }
    public string Name { get; init; }
    public string Race { get; init; }

    /// <summary>The hero the seat will lead: a human's pick, or the one the bot drew from the seed.</summary>
    public string Hero { get; init; }
    public bool IsBot { get; init; }
    public bool IsHost { get; init; }
}
