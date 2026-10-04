using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Events;

/// <summary>A match-wide moment every player hears about: first blood, kill streaks, shutdowns and the dragon.</summary>
public sealed class AnnouncementEvent : GameEvent
{
    public override string Kind => "announce";
    public AnnouncementType Type { get; init; }
    public string Title { get; init; }
    public string Text { get; init; }

    /// <summary>The player it is about, -1 for none.</summary>
    public int Player { get; init; } = -1;

    /// <summary>That player's team, -1 for none.</summary>
    public int Team { get; init; } = -1;

    public float X { get; init; }
    public float Y { get; init; }

    public override bool IsVisibleTo(Game game, Player viewer)
    {
        return true;
    }
}
