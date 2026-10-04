using System.Numerics;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Events;

/// <summary>A building finished an upgrade; seen by its team and by anyone who can see the spot.</summary>
public sealed class UpgradedEvent : GameEvent
{
    public override string Kind => "upgraded";
    public int Player { get; init; }
    public int Team { get; init; }
    public int Id { get; init; }
    public string What { get; init; }
    public int Level { get; init; }
    public float X { get; init; }
    public float Y { get; init; }

    public override bool IsVisibleTo(Game game, Player viewer)
    {
        return viewer.Team == Team || game.Vision.IsPointVisible(viewer.Team, new Vector2(X, Y));
    }
}
