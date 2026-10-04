namespace Crownfall.Server.Protocol.Messages;

public sealed class EndMessage : ServerMessage
{
    public override string T => "end";
    public int WinningTeam { get; init; }
    public int DurationSeconds { get; init; }
    public List<EndPlayerView> Players { get; init; } = [];
    public TimelineView Timeline { get; init; }
}
