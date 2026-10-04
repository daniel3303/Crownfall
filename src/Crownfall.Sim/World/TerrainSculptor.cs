using System.Numerics;

namespace Crownfall.Sim.World;

/// <summary>Deterministic terrain edits used by map generation: clearings, paths, shores and reachability.</summary>
public static class TerrainSculptor
{
    private static readonly (int X, int Y)[] Directions = [(1, 0), (-1, 0), (0, 1), (0, -1)];

    /// <summary>Turns every interior tile within the radius into grass; the map border always stays forest.</summary>
    public static void ClearDisc(GameMap map, Vector2 center, float radius)
    {
        var reach = (int)MathF.Ceiling(radius);
        for (var y = (int)center.Y - reach; y <= (int)center.Y + reach; y++)
        {
            for (var x = (int)center.X - reach; x <= (int)center.X + reach; x++)
            {
                if (IsInterior(map, x, y) && Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), center) <= radius)
                {
                    Clear(map, x, y);
                }
            }
        }
    }

    /// <summary>Cuts a walkable corridor through trees and water between two points.</summary>
    public static void CarveLine(GameMap map, Vector2 from, Vector2 to, float halfWidth)
    {
        var steps = (int)MathF.Ceiling(Vector2.Distance(from, to) * 2);
        var reach = (int)MathF.Ceiling(halfWidth);
        for (var i = 0; i <= steps; i++)
        {
            var point = Vector2.Lerp(from, to, i / (float)steps);
            for (var y = (int)point.Y - reach; y <= (int)point.Y + reach; y++)
            {
                for (var x = (int)point.X - reach; x <= (int)point.X + reach; x++)
                {
                    var near = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), point) <= halfWidth;
                    if (IsInterior(map, x, y) && near && !GameMap.IsPassableTerrain(map.Tile(x, y)))
                    {
                        Clear(map, x, y);
                    }
                }
            }
        }
    }

    /// <summary>Rings every lake with a beach on land and a wadeable shallow on the water side, so units can skirt the shore.</summary>
    public static void AddShores(GameMap map)
    {
        for (var y = 0; y < map.Height; y++)
        {
            for (var x = 0; x < map.Width; x++)
            {
                if (map.Tile(x, y) == TileType.Grass && Directions.Any(d => IsWater(map, x + d.X, y + d.Y)))
                {
                    map.SetTile(x, y, TileType.Sand);
                }
            }
        }
        // Only a rim with deep water behind it wades, so narrow channels stay deep except where they open into a lake.
        // Dry land a walk cannot reach is planted with forest afterwards, so wading only ever shortens routes.
        var shallows = new List<(int X, int Y)>();
        for (var y = 0; y < map.Height; y++)
        {
            for (var x = 0; x < map.Width; x++)
            {
                if (IsRim(map, x, y) && Neighbors(x, y).Any(n => IsWater(map, n.X, n.Y) && !TouchesDryGround(map, n.X, n.Y)))
                {
                    shallows.Add((x, y));
                }
            }
        }
        foreach (var (x, y) in shallows)
        {
            map.SetTile(x, y, TileType.Shallow);
        }
    }

    private static bool IsRim(GameMap map, int x, int y)
    {
        return map.Tile(x, y) == TileType.Water && IsInterior(map, x, y) && TouchesDryGround(map, x, y);
    }

    private static IEnumerable<(int X, int Y)> Neighbors(int x, int y)
    {
        for (var dy = -1; dy <= 1; dy++)
        {
            for (var dx = -1; dx <= 1; dx++)
            {
                if (dx != 0 || dy != 0)
                {
                    yield return (x + dx, y + dy);
                }
            }
        }
    }

    /// <summary>Tiles a walker can reach from the origin with 4-way steps over dry ground; shallows never join what water parts.</summary>
    public static bool[] FloodFill(GameMap map, Vector2 origin)
    {
        var reached = new bool[map.Width * map.Height];
        var queue = new Queue<(int X, int Y)>();
        var start = ((int)origin.X, (int)origin.Y);
        reached[map.Index(start.Item1, start.Item2)] = true;
        queue.Enqueue(start);
        while (queue.Count > 0)
        {
            var (x, y) = queue.Dequeue();
            foreach (var (dx, dy) in Directions)
            {
                var nx = x + dx;
                var ny = y + dy;
                if (!map.InBounds(nx, ny) || reached[map.Index(nx, ny)] || !GameMap.IsBuildableTerrain(map.Tile(nx, ny)))
                {
                    continue;
                }
                reached[map.Index(nx, ny)] = true;
                queue.Enqueue((nx, ny));
            }
        }
        return reached;
    }

    /// <summary>Fills pockets nobody can walk to with forest so no start or deposit lands there.</summary>
    public static void PlantUnreachable(GameMap map, bool[] reachable, int treeWood)
    {
        for (var y = 0; y < map.Height; y++)
        {
            for (var x = 0; x < map.Width; x++)
            {
                if (GameMap.IsBuildableTerrain(map.Tile(x, y)) && !reachable[map.Index(x, y)])
                {
                    map.PlantTree(x, y, treeWood);
                }
            }
        }
    }

    private static bool IsInterior(GameMap map, int x, int y)
    {
        return x > 0 && y > 0 && x < map.Width - 1 && y < map.Height - 1;
    }

    /// <summary>Any of the eight neighbours is dry, walkable ground, so the lake's outer ring wades all round, corners too.</summary>
    private static bool TouchesDryGround(GameMap map, int x, int y)
    {
        for (var dy = -1; dy <= 1; dy++)
        {
            for (var dx = -1; dx <= 1; dx++)
            {
                if (map.InBounds(x + dx, y + dy) && GameMap.IsBuildableTerrain(map.Tile(x + dx, y + dy)))
                {
                    return true;
                }
            }
        }
        return false;
    }

    private static bool IsWater(GameMap map, int x, int y)
    {
        return map.InBounds(x, y) && map.Tile(x, y) == TileType.Water;
    }

    private static void Clear(GameMap map, int x, int y)
    {
        map.SetTile(x, y, TileType.Grass);
        map.TreeWood[map.Index(x, y)] = 0;
    }
}
