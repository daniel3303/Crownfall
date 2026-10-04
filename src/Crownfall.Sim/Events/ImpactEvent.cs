using System.Numerics;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Events;

/// <summary>A delayed ability strike landing.</summary>
public sealed class ImpactEvent : GameEvent
{
    public override string Kind => "impact";
    public int Team { get; init; }
    public float X { get; init; }
    public float Y { get; init; }
    public float Radius { get; init; }

    public override bool IsVisibleTo(Game game, Player viewer)
    {
        return viewer.Team == Team || game.Vision.IsPointVisible(viewer.Team, new Vector2(X, Y));
    }
}
