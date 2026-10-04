namespace Crownfall.Sim.World;

/// <summary>Bresenham tile lines; the client draws wall ghosts with the same rule.</summary>
public static class TileLine
{
    /// <summary>Every tile from the start to the end, inclusive, each a king's step from the last.</summary>
    public static List<(int X, int Y)> Between(int x1, int y1, int x2, int y2)
    {
        var tiles = new List<(int X, int Y)>();
        var dx = Math.Abs(x2 - x1);
        var dy = -Math.Abs(y2 - y1);
        var sx = x1 < x2 ? 1 : -1;
        var sy = y1 < y2 ? 1 : -1;
        var error = dx + dy;
        var (x, y) = (x1, y1);
        while (true)
        {
            tiles.Add((x, y));
            if (x == x2 && y == y2)
            {
                return tiles;
            }
            var doubled = 2 * error;
            if (doubled >= dy)
            {
                error += dy;
                x += sx;
            }
            if (doubled <= dx)
            {
                error += dx;
                y += sy;
            }
        }
    }
}
