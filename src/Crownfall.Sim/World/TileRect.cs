using System.Numerics;

namespace Crownfall.Sim.World;

/// <summary>An axis-aligned block of tiles, used for building and node footprints.</summary>
public readonly record struct TileRect(int X, int Y, int Width, int Height)
{
    public Vector2 Center => new(X + Width / 2f, Y + Height / 2f);

    public bool Contains(int x, int y)
    {
        return x >= X && y >= Y && x < X + Width && y < Y + Height;
    }

    public Vector2 ClosestPoint(Vector2 point)
    {
        return new Vector2(Math.Clamp(point.X, X, X + Width), Math.Clamp(point.Y, Y, Y + Height));
    }

    public float DistanceTo(Vector2 point)
    {
        return Vector2.Distance(point, ClosestPoint(point));
    }

    public TileRect Inflate(int amount)
    {
        return new TileRect(X - amount, Y - amount, Width + amount * 2, Height + amount * 2);
    }

    public static TileRect Single(int x, int y)
    {
        return new TileRect(x, y, 1, 1);
    }
}
