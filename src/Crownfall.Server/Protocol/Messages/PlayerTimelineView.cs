namespace Crownfall.Server.Protocol.Messages;

/// <summary>One player's samples, aligned with <see cref="TimelineView.Seconds"/>.</summary>
public sealed class PlayerTimelineView
{
    public int Index { get; init; }

    /// <summary>Living soldiers, heroes excluded.</summary>
    public List<int> Army { get; init; } = [];

    public List<int> Gathered { get; init; } = [];
    public List<int> Score { get; init; } = [];
}
