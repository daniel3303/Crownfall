using System.Numerics;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Pathfinding;

/// <summary>
/// 8-way A* over the tile grid without corner cutting, followed by line-of-sight smoothing.
/// Unreachable goals return a path to the closest tile found. Searches per tick are budgeted.
/// Walkability is per team, so a team's own gates are open to it. A breaching search may also cross enemy wall
/// tiles at an extra cost that falls with the wall's health, so attackers converge on a wall already being broken; its
/// path then stops in front of the first one, reported in <see cref="LastBreachWall"/>.
/// </summary>
public sealed class Pathfinder
{
    public const int SearchBudgetPerTick = 80;

    private const int MaxExpansions = 9000;
    private const int GoalSearchRadius = 4;
    private const float Clearance = 0.28f;
    private const float SightStep = 0.2f;
    private const float StandOffDistance = 0.35f;

    // Extra cost of crossing an enemy wall tile, in tiles of detour: the base plus the health share of the rest. Kept
    // small enough that a fully walled goal does not explore the whole map before the search accepts the breach.
    private const float BreachBasePenalty = 4f;
    private const float BreachHealthPenalty = 8f;

    // Extra cost of a step into shallows, so paths keep to dry land unless wading saves a real detour.
    private const float WadePenalty = 0.6f;
    private static readonly (int Dx, int Dy, float Cost)[] Directions =
    [
        (1, 0, 1f), (-1, 0, 1f), (0, 1, 1f), (0, -1, 1f),
        (1, 1, MathF.Sqrt(2)), (1, -1, MathF.Sqrt(2)), (-1, 1, MathF.Sqrt(2)), (-1, -1, MathF.Sqrt(2)),
    ];

    private readonly GameMap _map;
    private readonly float[] _cost;
    private readonly int[] _parent;
    private readonly int[] _seenStamp;
    private readonly int[] _closedStamp;
    private readonly PriorityQueue<int, float> _open = new();
    private int _stamp;
    private int _searchesThisTick;
    private int _team = -1;
    private bool _breach;

    public Pathfinder(GameMap map)
    {
        _map = map;
        var size = map.Width * map.Height;
        _cost = new float[size];
        _parent = new int[size];
        _seenStamp = new int[size];
        _closedStamp = new int[size];
    }

    public bool HasBudget => _searchesThisTick < SearchBudgetPerTick;

    /// <summary>Remaining health share (0 to 1) of the wall with this occupant id; full health when unset.</summary>
    public Func<int, float> WallHealth { get; set; } = _ => 1f;

    /// <summary>Occupant id of the enemy wall the last returned path stops in front of, or 0.</summary>
    public int LastBreachWall { get; private set; }

    public void BeginTick()
    {
        _searchesThisTick = 0;
    }

    /// <summary>Path to a point for a unit of <paramref name="team"/>; the last waypoint is the point itself when it is walkable.</summary>
    public List<Vector2> FindPath(Vector2 from, Vector2 to, int team = -1, bool breach = false)
    {
        Begin(team, breach);
        var goalX = (int)MathF.Floor(to.X);
        var goalY = (int)MathF.Floor(to.Y);
        var exactGoal = _map.IsWalkable(goalX, goalY, team);
        if (!exactGoal && !TryNearestWalkable(goalX, goalY, out goalX, out goalY, team))
        {
            return [];
        }
        var goalRect = TileRect.Single(goalX, goalY);
        var tiles = StopAtBreach(Search(from, goalRect, adjacentGoal: false));
        var path = ToWaypoints(from, tiles);
        if (LastBreachWall == 0 && exactGoal && path.Count > 0 && tiles[^1] == (goalX, goalY))
        {
            path[^1] = to;
        }
        else if (exactGoal && tiles.Count == 0 && TileOf(from) == (goalX, goalY))
        {
            path.Add(to);
        }
        return path;
    }

    /// <summary>Path to any walkable tile touching the rectangle, e.g. beside a building or tree.</summary>
    public List<Vector2> FindPathToRect(Vector2 from, TileRect rect, int team = -1, bool breach = false)
    {
        Begin(team, breach);
        var tiles = StopAtBreach(Search(from, rect, adjacentGoal: true));
        if (tiles.Count > 0 || LastBreachWall != 0)
        {
            return ToWaypoints(from, tiles);
        }
        if (!IsGoal(TileOf(from).X, TileOf(from).Y, rect, adjacentGoal: true))
        {
            return [];
        }
        // Already beside the rect: step straight to just outside its nearest edge.
        var closest = rect.ClosestPoint(from);
        var away = from - closest;
        var standOff = away.LengthSquared() > 0.0001f ? closest + Vector2.Normalize(away) * StandOffDistance : from;
        return [standOff];
    }

    /// <summary>True when a unit of <paramref name="team"/> can walk the straight segment with its clearance.</summary>
    public bool HasLineOfSight(Vector2 from, Vector2 to, int team = -1)
    {
        var distance = Vector2.Distance(from, to);
        var steps = Math.Max(1, (int)MathF.Ceiling(distance / SightStep));
        for (var i = 0; i <= steps; i++)
        {
            var point = Vector2.Lerp(from, to, i / (float)steps);
            if (!_map.IsWalkable(point + new Vector2(-Clearance, -Clearance), team)
                || !_map.IsWalkable(point + new Vector2(Clearance, -Clearance), team)
                || !_map.IsWalkable(point + new Vector2(-Clearance, Clearance), team)
                || !_map.IsWalkable(point + new Vector2(Clearance, Clearance), team))
            {
                return false;
            }
        }
        return true;
    }

    /// <summary>The walkable tile nearest to (x, y); <paramref name="dry"/> skips shallows, for spawning units.</summary>
    public bool TryNearestWalkable(int x, int y, out int foundX, out int foundY, int team = -1, bool dry = false)
    {
        for (var ring = 0; ring <= GoalSearchRadius; ring++)
        {
            var bestDistance = float.MaxValue;
            foundX = foundY = 0;
            for (var dy = -ring; dy <= ring; dy++)
            {
                for (var dx = -ring; dx <= ring; dx++)
                {
                    if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != ring || !_map.IsWalkable(x + dx, y + dy, team) || dry && _map.IsShallow(x + dx, y + dy))
                    {
                        continue;
                    }
                    var distance = dx * dx + dy * dy;
                    if (distance < bestDistance)
                    {
                        bestDistance = distance;
                        foundX = x + dx;
                        foundY = y + dy;
                    }
                }
            }
            if (bestDistance < float.MaxValue)
            {
                return true;
            }
        }
        foundX = foundY = 0;
        return false;
    }

    private void Begin(int team, bool breach)
    {
        _team = team;
        _breach = breach;
        LastBreachWall = 0;
    }

    /// <summary>Cuts a breaching path before its first wall tile and remembers that wall.</summary>
    private List<(int X, int Y)> StopAtBreach(List<(int X, int Y)> tiles)
    {
        for (var i = 0; i < tiles.Count; i++)
        {
            var (x, y) = tiles[i];
            if (!_map.IsWalkable(x, y, _team))
            {
                LastBreachWall = _map.Occupant(x, y);
                return tiles.GetRange(0, i);
            }
        }
        return tiles;
    }

    private List<(int X, int Y)> Search(Vector2 from, TileRect goal, bool adjacentGoal)
    {
        _searchesThisTick++;
        _stamp++;
        _open.Clear();
        var (startX, startY) = TileOf(from);
        var start = _map.Index(startX, startY);
        if (IsGoal(startX, startY, goal, adjacentGoal))
        {
            return [];
        }
        Open(start, -1, 0, Heuristic(startX, startY, goal));
        var best = start;
        var bestHeuristic = Heuristic(startX, startY, goal);
        var expansions = 0;
        while (_open.TryDequeue(out var current, out _))
        {
            if (_closedStamp[current] == _stamp)
            {
                continue;
            }
            _closedStamp[current] = _stamp;
            var cx = current % _map.Width;
            var cy = current / _map.Width;
            if (IsGoal(cx, cy, goal, adjacentGoal))
            {
                return Reconstruct(current);
            }
            var heuristic = Heuristic(cx, cy, goal);
            if (heuristic < bestHeuristic)
            {
                bestHeuristic = heuristic;
                best = current;
            }
            if (++expansions > MaxExpansions)
            {
                break;
            }
            ExpandNeighbors(current, cx, cy, goal);
        }
        return Reconstruct(best);
    }

    private void ExpandNeighbors(int current, int cx, int cy, TileRect goal)
    {
        foreach (var (dx, dy, stepCost) in Directions)
        {
            var nx = cx + dx;
            var ny = cy + dy;
            var walkable = _map.IsWalkable(nx, ny, _team);
            // Walls are broken through straight on, never squeezed past diagonally.
            var breaching = !walkable && _breach && (dx == 0 || dy == 0) && _map.IsBreachable(nx, ny, _team);
            if (!walkable && !breaching)
            {
                continue;
            }
            if (dx != 0 && dy != 0 && (!_map.IsWalkable(cx + dx, cy, _team) || !_map.IsWalkable(cx, cy + dy, _team)))
            {
                continue;
            }
            var neighbor = _map.Index(nx, ny);
            if (_closedStamp[neighbor] == _stamp)
            {
                continue;
            }
            var cost = _cost[current] + stepCost + (breaching ? BreachCost(nx, ny) : 0) + (_map.IsShallow(nx, ny) ? WadePenalty : 0);
            if (_seenStamp[neighbor] != _stamp || cost < _cost[neighbor])
            {
                Open(neighbor, current, cost, cost + Heuristic(nx, ny, goal));
            }
        }
    }

    private float BreachCost(int x, int y)
    {
        return BreachBasePenalty + BreachHealthPenalty * Math.Clamp(WallHealth(_map.Occupant(x, y)), 0f, 1f);
    }

    private void Open(int index, int parent, float cost, float priority)
    {
        _seenStamp[index] = _stamp;
        _cost[index] = cost;
        _parent[index] = parent;
        _open.Enqueue(index, priority);
    }

    private List<(int X, int Y)> Reconstruct(int end)
    {
        var tiles = new List<(int X, int Y)>();
        var current = end;
        while (current >= 0 && _parent[current] >= 0)
        {
            tiles.Add((current % _map.Width, current / _map.Width));
            current = _parent[current];
        }
        tiles.Reverse();
        return tiles;
    }

    private List<Vector2> ToWaypoints(Vector2 from, List<(int X, int Y)> tiles)
    {
        var centers = tiles.Select(t => new Vector2(t.X + 0.5f, t.Y + 0.5f)).ToList();
        var result = new List<Vector2>();
        var anchor = from;
        var index = 0;
        while (index < centers.Count)
        {
            var next = index;
            while (next + 1 < centers.Count && HasLineOfSight(anchor, centers[next + 1], _team) && !Wades(anchor, centers[next + 1]))
            {
                next++;
            }
            result.Add(centers[next]);
            anchor = centers[next];
            index = next + 1;
        }
        return result;
    }

    /// <summary>True when a straight segment crosses shallows; smoothing keeps those stretches tile by tile, as the search priced them.</summary>
    private bool Wades(Vector2 from, Vector2 to)
    {
        var steps = Math.Max(1, (int)MathF.Ceiling(Vector2.Distance(from, to) / SightStep));
        for (var i = 0; i <= steps; i++)
        {
            var point = Vector2.Lerp(from, to, i / (float)steps);
            if (_map.IsShallow((int)MathF.Floor(point.X), (int)MathF.Floor(point.Y)))
            {
                return true;
            }
        }
        return false;
    }

    private static bool IsGoal(int x, int y, TileRect goal, bool adjacentGoal)
    {
        if (!adjacentGoal)
        {
            return goal.Contains(x, y);
        }
        return goal.Inflate(1).Contains(x, y) && !goal.Contains(x, y);
    }

    private static float Heuristic(int x, int y, TileRect goal)
    {
        var dx = Math.Max(0, Math.Max(goal.X - x, x - (goal.X + goal.Width - 1)));
        var dy = Math.Max(0, Math.Max(goal.Y - y, y - (goal.Y + goal.Height - 1)));
        var diagonal = Math.Min(dx, dy);
        return dx + dy + (MathF.Sqrt(2) - 2) * diagonal;
    }

    private static (int X, int Y) TileOf(Vector2 point)
    {
        return ((int)MathF.Floor(point.X), (int)MathF.Floor(point.Y));
    }
}
