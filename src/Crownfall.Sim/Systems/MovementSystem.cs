using System.Numerics;
using Crownfall.Sim.Entities;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Systems;

/// <summary>
/// Path following, stuck recovery and the per-tick push that keeps units from overlapping. Walkability is per team, so
/// units use their own gates; a breaching move may end at an enemy wall and report <see cref="MoveStatus.Blocked"/>.
/// </summary>
public sealed class MovementSystem
{
    private const int StuckCheckTicks = 10;
    private const float StuckDistance = 0.15f;
    private const int ChaseRepathTicks = 5;
    private const int RetryAfterExhaustedTicks = 10;

    /// <summary>Share of its speed a unit keeps while wading through shallows.</summary>
    public const float WadeSpeed = 0.7f;
    private const float GoalMovedThreshold = 0.5f;
    private const float MaxPushPerTick = 0.12f;
    private const float LargestUnitRadius = 0.6f;

    private readonly Game _game;
    private readonly List<Unit> _neighbors = [];

    public MovementSystem(Game game)
    {
        _game = game;
    }

    public MoveStatus MoveTo(Unit unit, Vector2 point, float arriveDistance, bool breach = false)
    {
        if (Vector2.Distance(unit.Position, point) <= arriveDistance)
        {
            unit.ClearPath();
            return MoveStatus.Arrived;
        }
        if (NeedsPath(unit, point, 0))
        {
            if (!_game.Pathfinder.HasBudget)
            {
                return MoveStatus.Moving;
            }
            AssignPath(unit, _game.Pathfinder.FindPath(unit.Position, point, unit.Team, breach), point);
        }
        Advance(unit);
        if (Vector2.Distance(unit.Position, point) <= arriveDistance)
        {
            unit.ClearPath();
            return MoveStatus.Arrived;
        }
        return PathExhaustedStatus(unit);
    }

    /// <summary>Moves until the unit's edge is within <paramref name="reach"/> of a static footprint.</summary>
    public MoveStatus MoveToRect(Unit unit, TileRect rect, float reach, bool breach = false)
    {
        if (InReach(unit, rect, reach))
        {
            unit.ClearPath();
            return MoveStatus.Arrived;
        }
        var goal = rect.Center;
        if (NeedsPath(unit, goal, 0))
        {
            if (!_game.Pathfinder.HasBudget)
            {
                return MoveStatus.Moving;
            }
            AssignPath(unit, _game.Pathfinder.FindPathToRect(unit.Position, rect, unit.Team, breach), goal);
        }
        Advance(unit);
        if (InReach(unit, rect, reach))
        {
            unit.ClearPath();
            return MoveStatus.Arrived;
        }
        return PathExhaustedStatus(unit);
    }

    /// <summary>Chases a moving unit, repathing every few ticks as it moves.</summary>
    public MoveStatus MoveToUnit(Unit unit, Unit target, float reach, bool breach = false)
    {
        if (target.EdgeDistance(unit.Position) - unit.Radius <= reach)
        {
            unit.ClearPath();
            return MoveStatus.Arrived;
        }
        if (NeedsPath(unit, target.Position, ChaseRepathTicks))
        {
            if (!_game.Pathfinder.HasBudget)
            {
                return MoveStatus.Moving;
            }
            AssignPath(unit, _game.Pathfinder.FindPath(unit.Position, target.Position, unit.Team, breach), target.Position);
        }
        Advance(unit);
        return IsBlocked(unit) ? MoveStatus.Blocked : MoveStatus.Moving;
    }

    public MoveStatus MoveToEntity(Unit unit, Entity target, float reach, bool breach = false)
    {
        return target is Unit targetUnit ? MoveToUnit(unit, targetUnit, reach, breach) : MoveToRect(unit, target.Footprint, reach, breach);
    }

    public static bool InReach(Unit unit, TileRect rect, float reach)
    {
        return rect.DistanceTo(unit.Position) - unit.Radius <= reach;
    }

    public static void Face(Unit unit, Vector2 point)
    {
        var delta = point - unit.Position;
        if (delta.LengthSquared() > 0.0001f)
        {
            unit.Facing = MathF.Atan2(delta.Y, delta.X);
        }
    }

    /// <summary>Pushes overlapping units apart and ejects units standing inside blocked tiles.</summary>
    public void Separate()
    {
        var units = _game.Entities.Units;
        _game.Spatial.Rebuild(units);
        foreach (var unit in units)
        {
            if (!unit.IsAlive)
            {
                continue;
            }
            EjectFromBlockedTile(unit);
            _neighbors.Clear();
            _game.Spatial.Query(unit.Position, unit.Radius + LargestUnitRadius, _neighbors.Add);
            foreach (var other in _neighbors)
            {
                if (other.Id > unit.Id)
                {
                    Push(unit, other);
                }
            }
        }
    }

    private void Push(Unit a, Unit b)
    {
        var delta = a.Position - b.Position;
        var distance = delta.Length();
        var minimum = a.Radius + b.Radius;
        if (distance >= minimum)
        {
            return;
        }
        var direction = distance > 0.001f ? delta / distance : new Vector2(MathF.Cos(a.Id * 2.399f), MathF.Sin(a.Id * 2.399f));
        var push = MathF.Min((minimum - distance) * 0.5f, MaxPushPerTick);
        TryShift(a, direction * push);
        TryShift(b, -direction * push);
    }

    private void TryShift(Unit unit, Vector2 delta)
    {
        var target = unit.Position + delta;
        var map = _game.Map;
        if (!map.IsWalkable(target, unit.Team))
        {
            return;
        }
        var (fromX, fromY) = ((int)MathF.Floor(unit.Position.X), (int)MathF.Floor(unit.Position.Y));
        var (toX, toY) = ((int)MathF.Floor(target.X), (int)MathF.Floor(target.Y));
        // A diagonal step past a closed wall corner is refused, or units slip between the tiles of a diagonal wall line.
        if (fromX != toX && fromY != toY && (ClosedWall(toX, fromY, unit.Team) || ClosedWall(fromX, toY, unit.Team)))
        {
            return;
        }
        unit.Position = target;
    }

    private bool ClosedWall(int x, int y, int team)
    {
        return _game.Map.IsWall(x, y) && !_game.Map.IsWalkable(x, y, team);
    }

    private void EjectFromBlockedTile(Unit unit)
    {
        if (_game.Map.IsWalkable(unit.Position, unit.Team))
        {
            return;
        }
        var x = (int)MathF.Floor(unit.Position.X);
        var y = (int)MathF.Floor(unit.Position.Y);
        if (_game.Pathfinder.TryNearestWalkable(x, y, out var freeX, out var freeY, unit.Team))
        {
            unit.Position = new Vector2(freeX + 0.5f, freeY + 0.5f);
            unit.ClearPath();
        }
    }

    private bool NeedsPath(Unit unit, Vector2 goal, int minRepathTicks)
    {
        if (unit.Path.Count == 0 || unit.PathIndex >= unit.Path.Count)
        {
            return _game.Tick - unit.PathTick >= 1;
        }
        if (Vector2.Distance(unit.PathGoal, goal) > GoalMovedThreshold)
        {
            return _game.Tick - unit.PathTick >= minRepathTicks;
        }
        return false;
    }

    private void AssignPath(Unit unit, List<Vector2> path, Vector2 goal)
    {
        unit.Path.Clear();
        unit.Path.AddRange(path);
        unit.PathIndex = 0;
        unit.PathGoal = goal;
        unit.PathTick = _game.Tick;
        unit.BreachWall = _game.Pathfinder.LastBreachWall;
        unit.StuckCheckPosition = unit.Position;
        unit.StuckCheckTick = _game.Tick;
    }

    private void Advance(Unit unit)
    {
        var remaining = unit.SpeedAt(_game.Tick) * _game.Dt * (IsWading(unit) ? WadeSpeed : 1);
        while (remaining > 0 && unit.PathIndex < unit.Path.Count)
        {
            var waypoint = unit.Path[unit.PathIndex];
            if (!_game.Map.IsWalkable(waypoint, unit.Team))
            {
                unit.ClearPath();
                return;
            }
            var delta = waypoint - unit.Position;
            var distance = delta.Length();
            if (distance > 0.0001f)
            {
                unit.Facing = MathF.Atan2(delta.Y, delta.X);
            }
            if (distance <= remaining)
            {
                unit.Position = waypoint;
                remaining -= distance;
                unit.PathIndex++;
            }
            else
            {
                unit.Position += delta / distance * remaining;
                remaining = 0;
            }
        }
        unit.Activity = UnitActivity.Move;
        DetectStuck(unit);
    }

    private void DetectStuck(Unit unit)
    {
        if (_game.Tick - unit.StuckCheckTick < StuckCheckTicks)
        {
            return;
        }
        var moved = Vector2.Distance(unit.Position, unit.StuckCheckPosition);
        unit.StuckCheckPosition = unit.Position;
        unit.StuckCheckTick = _game.Tick;
        if (moved < StuckDistance && unit.PathIndex < unit.Path.Count)
        {
            unit.ClearPath();
        }
    }

    /// <summary>The unit walked its whole path and an enemy wall stands where it went on.</summary>
    private static bool IsBlocked(Unit unit)
    {
        return unit.BreachWall != 0 && unit.PathIndex >= unit.Path.Count;
    }

    private bool IsWading(Unit unit)
    {
        return _game.Map.IsShallow((int)MathF.Floor(unit.Position.X), (int)MathF.Floor(unit.Position.Y));
    }

    private MoveStatus PathExhaustedStatus(Unit unit)
    {
        if (unit.PathIndex < unit.Path.Count)
        {
            return MoveStatus.Moving;
        }
        if (unit.BreachWall != 0)
        {
            return MoveStatus.Blocked;
        }
        return _game.Tick - unit.PathTick > RetryAfterExhaustedTicks ? MoveStatus.Moving : MoveStatus.Unreachable;
    }
}
