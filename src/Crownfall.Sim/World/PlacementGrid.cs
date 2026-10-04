using System.Numerics;
using Crownfall.Sim.Content;

namespace Crownfall.Sim.World;

/// <summary>Tracks reserved and reachable tiles while map generation places deposits, groves and camps.</summary>
internal sealed class PlacementGrid
{
    public const int EdgeMargin = 3;

    private readonly GameMap _map;
    private readonly bool[] _reserved;

    public PlacementGrid(GameMap map)
    {
        _map = map;
        _reserved = new bool[map.Width * map.Height];
    }

    public bool[] Reachable { get; set; }
    public List<NodePlacement> Nodes { get; } = [];

    public void Reserve(TileRect rect)
    {
        for (var y = rect.Y; y < rect.Y + rect.Height; y++)
        {
            for (var x = rect.X; x < rect.X + rect.Width; x++)
            {
                if (_map.InBounds(x, y))
                {
                    _reserved[_map.Index(x, y)] = true;
                }
            }
        }
    }

    /// <summary>True when the rect is reachable, passable, unreserved and away from the edge, with a free margin around it.</summary>
    public bool CanPlace(TileRect rect, int margin)
    {
        for (var y = rect.Y; y < rect.Y + rect.Height; y++)
        {
            for (var x = rect.X; x < rect.X + rect.Width; x++)
            {
                if (x < EdgeMargin || y < EdgeMargin || x >= _map.Width - EdgeMargin || y >= _map.Height - EdgeMargin)
                {
                    return false;
                }
                var index = _map.Index(x, y);
                if (_reserved[index] || !Reachable[index] || !GameMap.IsBuildableTerrain(_map.Tile(x, y)))
                {
                    return false;
                }
            }
        }
        var outer = rect.Inflate(margin);
        for (var y = outer.Y; y < outer.Y + outer.Height; y++)
        {
            for (var x = outer.X; x < outer.X + outer.Width; x++)
            {
                if (!_map.InBounds(x, y) || _reserved[_map.Index(x, y)])
                {
                    return false;
                }
            }
        }
        return true;
    }

    public bool TryPlaceNode(NodeDef def, TileRect rect, int margin)
    {
        if (!CanPlace(rect, margin))
        {
            return false;
        }
        Nodes.Add(new NodePlacement(def, rect));
        Reserve(rect.Inflate(margin));
        return true;
    }

    /// <summary>Places a deposit at the first free spot on growing square rings around a point.</summary>
    public void PlaceNodeNear(NodeDef def, Vector2 point, int margin, int searchRadius)
    {
        var originX = (int)MathF.Round(point.X - def.Size / 2f);
        var originY = (int)MathF.Round(point.Y - def.Size / 2f);
        for (var ring = 0; ring <= searchRadius; ring++)
        {
            for (var dy = -ring; dy <= ring; dy++)
            {
                for (var dx = -ring; dx <= ring; dx++)
                {
                    var onRing = Math.Max(Math.Abs(dx), Math.Abs(dy)) == ring;
                    if (onRing && TryPlaceNode(def, new TileRect(originX + dx, originY + dy, def.Size, def.Size), margin))
                    {
                        return;
                    }
                }
            }
        }
    }

    public void PlantGrove(Vector2 center, float radius, TileRect keepClear, int treeWood)
    {
        var reach = (int)MathF.Ceiling(radius);
        for (var y = (int)center.Y - reach; y <= (int)center.Y + reach; y++)
        {
            for (var x = (int)center.X - reach; x <= (int)center.X + reach; x++)
            {
                if (!_map.InBounds(x, y) || keepClear.Contains(x, y) || _reserved[_map.Index(x, y)])
                {
                    continue;
                }
                if (Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), center) <= radius && GameMap.IsBuildableTerrain(_map.Tile(x, y)))
                {
                    _map.PlantTree(x, y, treeWood);
                }
            }
        }
    }
}
