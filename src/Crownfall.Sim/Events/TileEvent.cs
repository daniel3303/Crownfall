using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Events;

/// <summary>Terrain changes this tick, each as [x, y, tile].</summary>
public sealed class TileEvent : GameEvent
{
    public override string Kind => "tiles";
    public List<int[]> Changes { get; init; } = [];

    public override bool IsVisibleTo(Game game, Player viewer)
    {
        return true;
    }
}
