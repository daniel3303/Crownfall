namespace Crownfall.Sim.World;

public sealed class MapLayout
{
    public GameMap Map { get; init; }
    public List<StartLocation> Starts { get; init; } = [];
    public List<NodePlacement> Nodes { get; init; } = [];
    public List<CampPlacement> Camps { get; init; } = [];

    /// <summary>Where the dragon lands: the map center, kept clear of camps and deposits.</summary>
    public System.Numerics.Vector2 Lair { get; init; }
}
