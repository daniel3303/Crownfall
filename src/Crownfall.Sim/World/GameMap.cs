using System.Numerics;

namespace Crownfall.Sim.World;

/// <summary>
/// The tile grid: terrain, tree wood, and which entity occupies each tile. Wall tiles remember their team so a
/// finished gate lets that team through and enemies can path into walls to break them.
/// </summary>
public sealed class GameMap
{
    private readonly TileType[] _tiles;
    private readonly int[] _occupants;
    private readonly bool[] _occupantBlocks;
    private readonly bool[] _sightBlockers;

    // Team + 1 of the wall-type building on each tile; 0 where there is none.
    private readonly int[] _wallTeam;
    private readonly bool[] _gateOpen;

    public GameMap(int width, int height)
    {
        Width = width;
        Height = height;
        _tiles = new TileType[width * height];
        _occupants = new int[width * height];
        _occupantBlocks = new bool[width * height];
        _sightBlockers = new bool[width * height];
        _wallTeam = new int[width * height];
        _gateOpen = new bool[width * height];
        TreeWood = new float[width * height];
    }

    public int Width { get; }
    public int Height { get; }
    public float[] TreeWood { get; }

    /// <summary>Tiles that hide what lies behind them: trees. Indexed like <see cref="Index"/>; read-only for callers.</summary>
    public bool[] SightBlockers => _sightBlockers;

    /// <summary>Terrain changes since the last drain, broadcast to clients as tile events.</summary>
    public List<TileChange> PendingChanges { get; } = [];

    public bool InBounds(int x, int y)
    {
        return x >= 0 && y >= 0 && x < Width && y < Height;
    }

    public int Index(int x, int y)
    {
        return y * Width + x;
    }

    public TileType Tile(int x, int y)
    {
        return InBounds(x, y) ? _tiles[Index(x, y)] : TileType.Water;
    }

    public void SetTile(int x, int y, TileType tile)
    {
        var index = Index(x, y);
        _tiles[index] = tile;
        _sightBlockers[index] = tile == TileType.Tree;
    }

    public int Occupant(int x, int y)
    {
        return InBounds(x, y) ? _occupants[Index(x, y)] : 0;
    }

    /// <summary>Terrain a unit can walk on, shallows included.</summary>
    public static bool IsPassableTerrain(TileType tile)
    {
        return tile is TileType.Grass or TileType.Sand or TileType.Shallow;
    }

    /// <summary>Dry ground, where buildings, deposits and camps can stand.</summary>
    public static bool IsBuildableTerrain(TileType tile)
    {
        return tile is TileType.Grass or TileType.Sand;
    }

    public bool IsShallow(int x, int y)
    {
        return InBounds(x, y) && _tiles[Index(x, y)] == TileType.Shallow;
    }

    public bool IsWalkable(int x, int y)
    {
        if (!InBounds(x, y))
        {
            return false;
        }
        var index = Index(x, y);
        return IsPassableTerrain(_tiles[index]) && !_occupantBlocks[index];
    }

    public bool IsWalkable(Vector2 point)
    {
        return IsWalkable((int)MathF.Floor(point.X), (int)MathF.Floor(point.Y));
    }

    /// <summary>Walkability for a unit of <paramref name="team"/>.</summary>
    public bool IsWalkable(Vector2 point, int team)
    {
        return IsWalkable((int)MathF.Floor(point.X), (int)MathF.Floor(point.Y), team);
    }

    /// <summary>Plain walkability, plus a finished gate of the unit's own team; neutral units (team -1) use no gate.</summary>
    public bool IsWalkable(int x, int y, int team)
    {
        if (!InBounds(x, y))
        {
            return false;
        }
        var index = Index(x, y);
        if (!IsPassableTerrain(_tiles[index]))
        {
            return false;
        }
        return !_occupantBlocks[index] || (team >= 0 && _gateOpen[index] && _wallTeam[index] == team + 1);
    }

    /// <summary>True on a wall, gate or wall tower that is not <paramref name="team"/>'s: attackers may path into it to break it.</summary>
    public bool IsBreachable(int x, int y, int team)
    {
        if (!InBounds(x, y))
        {
            return false;
        }
        var wall = _wallTeam[Index(x, y)];
        return wall != 0 && wall != team + 1;
    }

    /// <summary>True on any team's wall, gate or wall tower.</summary>
    public bool IsWall(int x, int y)
    {
        return InBounds(x, y) && _wallTeam[Index(x, y)] != 0;
    }

    /// <summary>Marks a wall-type footprint as <paramref name="team"/>'s.</summary>
    public void MarkWall(TileRect rect, int team)
    {
        ForEach(rect, index => _wallTeam[index] = team + 1);
    }

    /// <summary>Lets the wall's own team through a finished gate.</summary>
    public void OpenGate(TileRect rect)
    {
        ForEach(rect, index => _gateOpen[index] = true);
    }

    /// <summary>
    /// True when terrain allows a building here and nothing occupies the tile. Walls may also stand in shallows, so a
    /// lakeside base can still be sealed.
    /// </summary>
    public bool IsBuildable(int x, int y, bool inShallows = false)
    {
        if (!InBounds(x, y) || _occupants[Index(x, y)] != 0)
        {
            return false;
        }
        var tile = _tiles[Index(x, y)];
        return IsBuildableTerrain(tile) || inShallows && tile == TileType.Shallow;
    }

    public bool IsBuildable(TileRect rect, bool inShallows = false)
    {
        for (var y = rect.Y; y < rect.Y + rect.Height; y++)
        {
            for (var x = rect.X; x < rect.X + rect.Width; x++)
            {
                if (!IsBuildable(x, y, inShallows))
                {
                    return false;
                }
            }
        }
        return true;
    }

    public void Occupy(TileRect rect, int entityId, bool blocksMovement)
    {
        for (var y = rect.Y; y < rect.Y + rect.Height; y++)
        {
            for (var x = rect.X; x < rect.X + rect.Width; x++)
            {
                var index = Index(x, y);
                _occupants[index] = entityId;
                _occupantBlocks[index] = blocksMovement;
            }
        }
    }

    public void Vacate(TileRect rect, int entityId)
    {
        for (var y = rect.Y; y < rect.Y + rect.Height; y++)
        {
            for (var x = rect.X; x < rect.X + rect.Width; x++)
            {
                var index = Index(x, y);
                if (_occupants[index] == entityId)
                {
                    _occupants[index] = 0;
                    _occupantBlocks[index] = false;
                    _wallTeam[index] = 0;
                    _gateOpen[index] = false;
                }
            }
        }
    }

    private void ForEach(TileRect rect, Action<int> visit)
    {
        for (var y = rect.Y; y < rect.Y + rect.Height; y++)
        {
            for (var x = rect.X; x < rect.X + rect.Width; x++)
            {
                if (InBounds(x, y))
                {
                    visit(Index(x, y));
                }
            }
        }
    }

    public void PlantTree(int x, int y, float wood)
    {
        SetTile(x, y, TileType.Tree);
        TreeWood[Index(x, y)] = wood;
    }

    /// <summary>Removes a depleted tree and records the change for clients.</summary>
    public void FellTree(int x, int y)
    {
        SetTile(x, y, TileType.Grass);
        TreeWood[Index(x, y)] = 0;
        PendingChanges.Add(new TileChange(x, y, TileType.Grass));
    }

    public byte[] TileBytes()
    {
        var bytes = new byte[_tiles.Length];
        for (var i = 0; i < _tiles.Length; i++)
        {
            bytes[i] = (byte)_tiles[i];
        }
        return bytes;
    }
}
