namespace Crownfall.Server.Protocol.Messages;

/// <summary>Per-player stats sampled through the match, for the end screen's graphs; sample i was taken at Seconds[i].</summary>
public sealed class TimelineView
{
    public int IntervalSeconds { get; init; }
    public List<int> Seconds { get; init; } = [];
    public List<PlayerTimelineView> Players { get; init; } = [];
}
