using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Events;

/// <summary>A building finished construction or a unit finished training.</summary>
public sealed class CompletedEvent : GameEvent
{
    public override string Kind => "completed";
    public int Player { get; init; }
    public int Id { get; init; }
    public string What { get; init; }

    public override bool IsVisibleTo(Game game, Player viewer)
    {
        return viewer.Index == Player;
    }
}
