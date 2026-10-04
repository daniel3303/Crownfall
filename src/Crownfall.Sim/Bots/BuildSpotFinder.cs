using System.Numerics;
using Crownfall.Sim.Content;
using Crownfall.Sim.Entities;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Bots;

/// <summary>Finds a legal, explored building spot near a point, keeping a walkable gap so bases never wall themselves in.</summary>
public static class BuildSpotFinder
{
    public static bool TryFind(Game game, Player player, BuildingDef def, Vector2 near, int minRadius, int maxRadius, out TileRect spot)
    {
        var requireGap = !def.Walkable;
        var centerX = (int)MathF.Floor(near.X);
        var centerY = (int)MathF.Floor(near.Y);
        var rotation = game.Rng.Next(4);
        for (var ring = minRadius; ring <= maxRadius; ring++)
        {
            foreach (var (dx, dy) in RingOffsets(ring, rotation))
            {
                var rect = new TileRect(centerX + dx - def.Size / 2, centerY + dy - def.Size / 2, def.Size, def.Size);
                if (IsGoodSpot(game, player, rect, requireGap))
                {
                    spot = rect;
                    return true;
                }
            }
        }
        spot = default;
        return false;
    }

    private static bool IsGoodSpot(Game game, Player player, TileRect rect, bool requireGap)
    {
        if (!game.Map.IsBuildable(rect) || !game.Vision.IsRectExplored(player.Team, rect))
        {
            return false;
        }
        if (!requireGap)
        {
            return true;
        }
        var ring = rect.Inflate(1);
        for (var y = ring.Y; y < ring.Y + ring.Height; y++)
        {
            for (var x = ring.X; x < ring.X + ring.Width; x++)
            {
                if (!rect.Contains(x, y) && (!game.Map.InBounds(x, y) || game.Map.Occupant(x, y) != 0))
                {
                    return false;
                }
            }
        }
        return true;
    }

    private static IEnumerable<(int Dx, int Dy)> RingOffsets(int ring, int rotation)
    {
        var offsets = new List<(int, int)>();
        for (var dy = -ring; dy <= ring; dy++)
        {
            for (var dx = -ring; dx <= ring; dx++)
            {
                if (Math.Max(Math.Abs(dx), Math.Abs(dy)) == ring)
                {
                    offsets.Add((dx, dy));
                }
            }
        }
        var shift = offsets.Count * rotation / 4;
        return offsets.Skip(shift).Concat(offsets.Take(shift));
    }
}
