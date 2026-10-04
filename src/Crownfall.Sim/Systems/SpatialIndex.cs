using System.Numerics;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Systems;

/// <summary>A uniform grid of units rebuilt each tick for neighbor and target queries.</summary>
public sealed class SpatialIndex
{
    private const int CellSize = 4;
    private readonly int _columns;
    private readonly int _rows;
    private readonly List<Unit>[] _cells;

    public SpatialIndex(int width, int height)
    {
        _columns = width / CellSize + 1;
        _rows = height / CellSize + 1;
        _cells = new List<Unit>[_columns * _rows];
        for (var i = 0; i < _cells.Length; i++)
        {
            _cells[i] = [];
        }
    }

    public void Rebuild(IReadOnlyList<Unit> units)
    {
        foreach (var cell in _cells)
        {
            cell.Clear();
        }
        foreach (var unit in units)
        {
            if (unit.IsAlive)
            {
                _cells[CellIndex(unit.Position)].Add(unit);
            }
        }
    }

    /// <summary>Calls <paramref name="visit"/> for every unit whose center lies within the radius.</summary>
    public void Query(Vector2 center, float radius, Action<Unit> visit)
    {
        var minX = Math.Max(0, (int)((center.X - radius) / CellSize));
        var maxX = Math.Min(_columns - 1, (int)((center.X + radius) / CellSize));
        var minY = Math.Max(0, (int)((center.Y - radius) / CellSize));
        var maxY = Math.Min(_rows - 1, (int)((center.Y + radius) / CellSize));
        var radiusSquared = radius * radius;
        for (var y = minY; y <= maxY; y++)
        {
            for (var x = minX; x <= maxX; x++)
            {
                foreach (var unit in _cells[y * _columns + x])
                {
                    if (Vector2.DistanceSquared(unit.Position, center) <= radiusSquared)
                    {
                        visit(unit);
                    }
                }
            }
        }
    }

    public List<Unit> Within(Vector2 center, float radius)
    {
        var result = new List<Unit>();
        Query(center, radius, result.Add);
        return result;
    }

    private int CellIndex(Vector2 position)
    {
        var x = Math.Clamp((int)(position.X / CellSize), 0, _columns - 1);
        var y = Math.Clamp((int)(position.Y / CellSize), 0, _rows - 1);
        return y * _columns + x;
    }
}
