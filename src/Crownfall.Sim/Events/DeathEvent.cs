using System.Numerics;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Events;

public sealed class DeathEvent : GameEvent
{
    public override string Kind => "death";
    public int Id { get; init; }
    public int Owner { get; init; }
    /// <summary>Content kind of the dead entity, so clients can play its death or leave its rubble.</summary>
    public int EntityKind { get; init; }
    public float X { get; init; }
    public float Y { get; init; }
    public string Category { get; init; }

    public override bool IsVisibleTo(Game game, Player viewer)
    {
        return Owner == viewer.Index || game.Vision.IsPointVisible(viewer.Team, new Vector2(X, Y));
    }
}
