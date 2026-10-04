using System.Numerics;

namespace Crownfall.Sim.World;

/// <summary>Where one seat's town center stands. Facing points toward the map center.</summary>
public sealed class StartLocation
{
    public int Team { get; init; }
    public int Slot { get; init; }
    public TileRect TownCenter { get; init; }
    public float Facing { get; init; }

    public Vector2 Center => TownCenter.Center;
}
