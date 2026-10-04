namespace Crownfall.Sim.World;

public sealed class MapLayout
{
    public GameMap Map { get; init; }
    public List<StartLocation> Starts { get; init; } = [];
    public List<NodePlacement> Nodes { get; init; } = [];
    public List<CampPlacement> Camps { get; init; } = [];
}
