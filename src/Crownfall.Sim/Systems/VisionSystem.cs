using System.Numerics;
using Crownfall.Sim.Entities;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Systems;

/// <summary>
/// Per-team fog of war with line of sight: an entity reveals the tiles of its <see cref="SightPattern"/> that no tree
/// hides. Walls and buildings never block sight, so defenders always see out over their own walls. The client stamps
/// with the same rule.
/// </summary>
public sealed class VisionSystem
{
    private readonly GameMap _map;
    private readonly byte[][] _visible;
    private readonly byte[][] _explored;
    private readonly HashSet<long> _stamped = [];
    private bool[] _open = new bool[1];

    public VisionSystem(GameMap map, int teams)
    {
        _map = map;
        _visible = new byte[teams][];
        _explored = new byte[teams][];
        for (var team = 0; team < teams; team++)
        {
            _visible[team] = new byte[map.Width * map.Height];
            _explored[team] = new byte[map.Width * map.Height];
        }
    }

    public void Update(EntityStore entities)
    {
        foreach (var visible in _visible)
        {
            Array.Clear(visible);
        }
        _stamped.Clear();
        foreach (var unit in entities.Units)
        {
            Stamp(unit);
        }
        foreach (var building in entities.Buildings)
        {
            Stamp(building);
        }
    }

    public bool IsTileVisible(int team, int x, int y)
    {
        return team >= 0 && team < _visible.Length && _map.InBounds(x, y) && _visible[team][_map.Index(x, y)] != 0;
    }

    public bool IsTileExplored(int team, int x, int y)
    {
        return team >= 0 && team < _explored.Length && _map.InBounds(x, y) && _explored[team][_map.Index(x, y)] != 0;
    }

    public bool IsPointVisible(int team, Vector2 point)
    {
        return IsTileVisible(team, (int)MathF.Floor(point.X), (int)MathF.Floor(point.Y));
    }

    public bool IsVisible(int team, Entity entity)
    {
        if (entity.Owner != null && entity.Team == team)
        {
            return true;
        }
        var footprint = entity.Footprint;
        for (var y = footprint.Y; y < footprint.Y + footprint.Height; y++)
        {
            for (var x = footprint.X; x < footprint.X + footprint.Width; x++)
            {
                if (IsTileVisible(team, x, y))
                {
                    return true;
                }
            }
        }
        return false;
    }

    public bool IsRectExplored(int team, TileRect rect)
    {
        for (var y = rect.Y; y < rect.Y + rect.Height; y++)
        {
            for (var x = rect.X; x < rect.X + rect.Width; x++)
            {
                if (!IsTileExplored(team, x, y))
                {
                    return false;
                }
            }
        }
        return true;
    }

    /// <summary>
    /// Walks the sight tree from the viewer outward: a tile is seen when its parent is open, and open when seen and not a
    /// tree. The viewer's own tile never blocks. Viewers sharing a tile and radius are stamped once.
    /// </summary>
    private void Stamp(Entity entity)
    {
        if (entity.Owner == null || entity.IsRemoved || entity.Sight <= 0)
        {
            return;
        }
        var centerX = (int)MathF.Floor(entity.Position.X);
        var centerY = (int)MathF.Floor(entity.Position.Y);
        var radius = entity.Sight;
        if (!_map.InBounds(centerX, centerY) || !_stamped.Add(((long)entity.Team << 40) | ((long)radius << 32) | (uint)_map.Index(centerX, centerY)))
        {
            return;
        }
        var pattern = SightPattern.For(radius);
        if (_open.Length < pattern.Count)
        {
            _open = new bool[pattern.Count];
        }
        var inside = centerX - radius >= 0 && centerY - radius >= 0 && centerX + radius < _map.Width && centerY + radius < _map.Height;
        if (inside)
        {
            StampInside(pattern, _map.Index(centerX, centerY), _visible[entity.Team], _explored[entity.Team]);
        }
        else
        {
            StampClipped(pattern, centerX, centerY, _visible[entity.Team], _explored[entity.Team]);
        }
    }

    private void StampInside(SightPattern pattern, int center, byte[] visible, byte[] explored)
    {
        var offsets = pattern.OffsetsFor(_map.Width);
        var parents = pattern.Parent;
        var blockers = _map.SightBlockers;
        var open = _open;
        visible[center] = 1;
        explored[center] = 1;
        open[0] = true;
        for (var i = 1; i < offsets.Length; i++)
        {
            if (!open[parents[i]])
            {
                open[i] = false;
                continue;
            }
            var index = center + offsets[i];
            visible[index] = 1;
            explored[index] = 1;
            open[i] = !blockers[index];
        }
    }

    private void StampClipped(SightPattern pattern, int centerX, int centerY, byte[] visible, byte[] explored)
    {
        var blockers = _map.SightBlockers;
        var open = _open;
        open[0] = true;
        for (var i = 0; i < pattern.Count; i++)
        {
            if (i > 0 && !open[pattern.Parent[i]])
            {
                open[i] = false;
                continue;
            }
            var x = centerX + pattern.Dx[i];
            var y = centerY + pattern.Dy[i];
            if (!_map.InBounds(x, y))
            {
                open[i] = true;
                continue;
            }
            var index = _map.Index(x, y);
            visible[index] = 1;
            explored[index] = 1;
            open[i] = i == 0 || !blockers[index];
        }
    }
}
