using System.Numerics;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Events;

public sealed class AbilityEvent : GameEvent
{
    public override string Kind => "ability";
    public int Player { get; init; }
    public int Team { get; init; }
    public int Hero { get; init; }
    public int Slot { get; init; }
    public float X { get; init; }
    public float Y { get; init; }
    public float Radius { get; init; }
    public int DelayTicks { get; init; }

    public override bool IsVisibleTo(Game game, Player viewer)
    {
        return viewer.Team == Team || game.Vision.IsPointVisible(viewer.Team, new Vector2(X, Y));
    }
}
