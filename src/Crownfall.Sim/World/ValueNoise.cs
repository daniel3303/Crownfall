namespace Crownfall.Sim.World;

/// <summary>Smooth value noise in [0, 1] sampled on a coarse random grid.</summary>
public static class ValueNoise
{
    public static float[] Generate(Random rng, int size, int cell)
    {
        var gridSize = size / cell + 2;
        var grid = new float[gridSize * gridSize];
        for (var i = 0; i < grid.Length; i++)
        {
            grid[i] = rng.NextSingle();
        }
        var result = new float[size * size];
        for (var y = 0; y < size; y++)
        {
            for (var x = 0; x < size; x++)
            {
                result[y * size + x] = Sample(grid, gridSize, x / (float)cell, y / (float)cell);
            }
        }
        return result;
    }

    private static float Sample(float[] grid, int gridSize, float gx, float gy)
    {
        var x0 = (int)gx;
        var y0 = (int)gy;
        var fx = Smooth(gx - x0);
        var fy = Smooth(gy - y0);
        var top = Lerp(grid[y0 * gridSize + x0], grid[y0 * gridSize + x0 + 1], fx);
        var bottom = Lerp(grid[(y0 + 1) * gridSize + x0], grid[(y0 + 1) * gridSize + x0 + 1], fx);
        return Lerp(top, bottom, fy);
    }

    private static float Smooth(float t)
    {
        return t * t * (3 - 2 * t);
    }

    private static float Lerp(float a, float b, float t)
    {
        return a + (b - a) * t;
    }
}
