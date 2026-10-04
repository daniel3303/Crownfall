namespace Crownfall.Server.Protocol.Messages;

public sealed class MapView
{
    public int Width { get; init; }
    public int Height { get; init; }

    /// <summary>Base64 of one byte per tile (row-major), see TileType.</summary>
    public string Tiles { get; init; }
}
