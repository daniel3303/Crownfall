namespace Crownfall.Sim.Commands;

/// <summary>Gather from a node or farm (Target) or from the tree at TileX/TileY when Target is 0.</summary>
public sealed class GatherCommand : UnitsCommand
{
    public int Target { get; set; }
    public int TileX { get; set; }
    public int TileY { get; set; }
}
