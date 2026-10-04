using System.Numerics;
using Crownfall.Sim.Content;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Bots;

/// <summary>An enemy building a bot has seen, remembered through fog until it sees the spot empty.</summary>
public sealed class KnownBuilding
{
    public int Id { get; init; }
    public BuildingDef Def { get; init; }
    public int Owner { get; init; }
    public TileRect Rect { get; init; }
    public Vector2 Position => Rect.Center;
}
