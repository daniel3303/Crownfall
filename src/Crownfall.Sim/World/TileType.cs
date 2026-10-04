namespace Crownfall.Sim.World;

public enum TileType : byte
{
    Grass = 0,
    Sand = 1,
    Water = 2,
    Tree = 3,

    /// <summary>The edge of a lake: units wade through it, slowly, but nothing is built or placed on it.</summary>
    Shallow = 4,
}
