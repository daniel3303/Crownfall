using System.Numerics;

namespace Crownfall.Sim.Bots;

/// <summary>
/// Picks where an attack goes, from remembered buildings only: the nearest enemy base, hitting its barracks and towers
/// first, then its town center, then the rest. Without a known base the army explores the likeliest unexplored start.
/// </summary>
public sealed class BotTargeting
{
    // Buildings within this distance of the nearest known enemy building count as the same base.
    private const float BaseRadius = 18f;

    private const int VillagerTrailSeconds = 60;

    // Paths passing this close to a remembered boss camp bend around it by the detour distance; a passive boss is passed by.
    public const float BossClearance = 9f;
    private const float BossDetour = 12f;

    private readonly Game _game;
    private readonly BotMemory _memory;

    public BotTargeting(Game game, BotMemory memory)
    {
        _game = game;
        _memory = memory;
    }

    /// <summary>The objective point and, when it is a remembered building, that building's id (else 0).</summary>
    public bool TryPick(Vector2 from, out Vector2 point, out int buildingId)
    {
        if (TryPickBuilding(from, out var building))
        {
            point = building.Position;
            buildingId = building.Id;
            return true;
        }
        buildingId = 0;
        if (_memory.TryUnexploredStart(out point))
        {
            return true;
        }
        var trailTicks = VillagerTrailSeconds * _game.Content.Rules.TickRate;
        point = _memory.LastVillagerSighting;
        return _game.Tick - _memory.LastVillagerSightingTick <= trailTicks;
    }

    /// <summary>A waypoint that skirts a remembered, likely living boss camp near the straight path; null when the path is clear.</summary>
    public Vector2? Detour(Vector2 from, Vector2 to)
    {
        var heading = to - from;
        if (heading.LengthSquared() < 0.01f)
        {
            return null;
        }
        var side = Vector2.Normalize(new Vector2(-heading.Y, heading.X));
        foreach (var camp in _memory.Camps)
        {
            if (!camp.HasBoss || camp.IsPassive || !_memory.IsCampLikelyAlive(camp, _game.Tick) || DistanceToSegment(camp.Center, from, to) > BossClearance)
            {
                continue;
            }
            var away = Vector2.Dot(camp.Center - from, side) > 0 ? -side : side;
            return camp.Center + away * BossDetour;
        }
        return null;
    }

    /// <summary>True when a point lies near a remembered boss camp that is probably still standing.</summary>
    public bool NearBoss(Vector2 point)
    {
        return _memory.Camps.Any(c => c.HasBoss && _memory.IsCampLikelyAlive(c, _game.Tick) && Vector2.Distance(c.Center, point) <= BossClearance);
    }

    private static float DistanceToSegment(Vector2 point, Vector2 from, Vector2 to)
    {
        var segment = to - from;
        var t = Math.Clamp(Vector2.Dot(point - from, segment) / segment.LengthSquared(), 0f, 1f);
        return Vector2.Distance(point, from + segment * t);
    }

    private bool TryPickBuilding(Vector2 from, out KnownBuilding best)
    {
        best = null;
        KnownBuilding anchor = null;
        foreach (var building in _memory.Buildings)
        {
            if (anchor == null || Vector2.Distance(from, building.Position) < Vector2.Distance(from, anchor.Position))
            {
                anchor = building;
            }
        }
        if (anchor == null)
        {
            return false;
        }
        var bestScore = float.MaxValue;
        foreach (var building in _memory.Buildings)
        {
            if (Vector2.Distance(anchor.Position, building.Position) > BaseRadius)
            {
                continue;
            }
            var score = Priority(building) * 1000 + Vector2.Distance(from, building.Position);
            if (score < bestScore)
            {
                bestScore = score;
                best = building;
            }
        }
        return best != null;
    }

    /// <summary>Military buildings first, then the town center, then houses, farms and storehouses.</summary>
    private static int Priority(KnownBuilding building)
    {
        var def = building.Def;
        if (def.IsTownCenter)
        {
            return 1;
        }
        return def.Attack != null || def.TrainableUnits.Any(u => u.IsMilitary) ? 0 : 2;
    }
}
