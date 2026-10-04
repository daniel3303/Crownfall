using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Events;

/// <summary>A message for one player, optionally pointing at a map position.</summary>
public sealed class NoticeEvent : GameEvent
{
    public override string Kind => "notice";
    public int Player { get; init; }
    public string Text { get; init; }
    public NoticeTone Tone { get; init; }
    public bool HasPosition { get; init; }
    public float X { get; init; }
    public float Y { get; init; }

    public override bool IsVisibleTo(Game game, Player viewer)
    {
        return viewer.Index == Player;
    }
}
