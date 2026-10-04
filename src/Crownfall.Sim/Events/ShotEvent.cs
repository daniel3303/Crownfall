using System.Numerics;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Events;

public sealed class ShotEvent : GameEvent
{
    public override string Kind => "shot";
    public int From { get; init; }
    public int To { get; init; }
    public float X { get; init; }
    public float Y { get; init; }
    public float Tx { get; init; }
    public float Ty { get; init; }
    public int Ticks { get; init; }

    public override bool IsVisibleTo(Game game, Player viewer)
    {
        return game.Vision.IsPointVisible(viewer.Team, new Vector2(X, Y)) || game.Vision.IsPointVisible(viewer.Team, new Vector2(Tx, Ty));
    }
}
