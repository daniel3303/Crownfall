namespace Crownfall.Sim.Systems;

/// <summary>
/// The tiles within a sight radius (dx² + dy² ≤ r²) as a line-of-sight tree. Each tile's parent is the tile one step
/// closer along the line back to the viewer: with n = max(|dx|, |dy|), the parent is (dx, dy)·(n−1)/n rounded half away
/// from zero. A tile is seen when its parent is seen and the parent is not a sight blocker, so a tree at a forest's edge
/// is visible and the tiles behind it are not. The client builds the same tree in vision.ts.
/// </summary>
public sealed class SightPattern
{
    private static readonly Dictionary<int, SightPattern> Cache = [];
    private readonly Dictionary<int, int[]> _offsetsByWidth = [];

    private SightPattern(int radius)
    {
        var tiles = new List<(int Dx, int Dy)>();
        for (var ring = 0; ring <= radius; ring++)
        {
            for (var dy = -ring; dy <= ring; dy++)
            {
                for (var dx = -ring; dx <= ring; dx++)
                {
                    if (Math.Max(Math.Abs(dx), Math.Abs(dy)) == ring && dx * dx + dy * dy <= radius * radius)
                    {
                        tiles.Add((dx, dy));
                    }
                }
            }
        }
        var index = new Dictionary<(int, int), int>();
        for (var i = 0; i < tiles.Count; i++)
        {
            index[tiles[i]] = i;
        }
        Dx = tiles.Select(t => t.Dx).ToArray();
        Dy = tiles.Select(t => t.Dy).ToArray();
        Parent = tiles.Select(t => t == (0, 0) ? -1 : index[ParentOf(t.Dx, t.Dy)]).ToArray();
    }

    /// <summary>Offsets in ring order, so every parent comes before its children; index 0 is the viewer's tile.</summary>
    public int[] Dx { get; }

    public int[] Dy { get; }

    /// <summary>Index of each tile's parent; -1 for the viewer's tile.</summary>
    public int[] Parent { get; }

    public int Count => Dx.Length;

    public int Radius { get; private init; }

    /// <summary>Each tile's index offset from the viewer's tile on a map of this width.</summary>
    public int[] OffsetsFor(int width)
    {
        lock (_offsetsByWidth)
        {
            if (!_offsetsByWidth.TryGetValue(width, out var offsets))
            {
                offsets = new int[Count];
                for (var i = 0; i < Count; i++)
                {
                    offsets[i] = Dy[i] * width + Dx[i];
                }
                _offsetsByWidth[width] = offsets;
            }
            return offsets;
        }
    }

    public static SightPattern For(int radius)
    {
        lock (Cache)
        {
            if (!Cache.TryGetValue(radius, out var pattern))
            {
                pattern = new SightPattern(radius) { Radius = radius };
                Cache[radius] = pattern;
            }
            return pattern;
        }
    }

    public static (int Dx, int Dy) ParentOf(int dx, int dy)
    {
        var steps = Math.Max(Math.Abs(dx), Math.Abs(dy));
        return (StepBack(dx, steps), StepBack(dy, steps));
    }

    private static int StepBack(int value, int steps)
    {
        var magnitude = (Math.Abs(value) * (steps - 1) * 2 + steps) / (2 * steps);
        return Math.Sign(value) * magnitude;
    }
}
