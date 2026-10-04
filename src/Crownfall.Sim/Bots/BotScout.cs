using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>
/// Scouting with a cheap unit: an early villager trip to the likeliest enemy start, then trips by the fastest soldier
/// whenever enemy soldiers have gone unseen for the profile's interval. While scouting, the unit is taken out of the
/// view so the economy and army leave it alone.
/// </summary>
public sealed class BotScout
{
    // Routes pass this far to the side of the map center: close enough for the scout to see a camp there, outside its aggro.
    private const float CenterDetour = 6f;

    // The lookout sees a town center at the target while staying outside the sight of units standing behind it.
    private const float StandOff = 10.5f;

    private const float WaypointReached = 2.5f;
    private const float AbortHealth = 0.5f;
    private const int MinVillagers = 4;

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotProfile _profile;
    private readonly BotMemory _memory;
    private readonly Queue<Vector2> _route = new();
    private int _scoutId;
    private bool _scoutedEarly;
    private int _lastScoutTick;

    public BotScout(Game game, Player player, BotProfile profile, BotMemory memory)
    {
        _game = game;
        _player = player;
        _profile = profile;
        _memory = memory;
    }

    public void Run(BotView view, BotMode mode)
    {
        var scout = _scoutId == 0 ? null : _game.Entities.Get(_scoutId) as Unit;
        if (scout is not { IsAlive: true })
        {
            _scoutId = 0;
            _route.Clear();
            scout = mode == BotMode.Building ? TryStart(view) : null;
        }
        if (scout == null)
        {
            return;
        }
        view.Villagers.Remove(scout);
        view.Army.Remove(scout);
        while (_route.Count > 0 && Vector2.Distance(scout.Position, _route.Peek()) <= WaypointReached)
        {
            _route.Dequeue();
        }
        if (_route.Count == 0 || scout.Hp < scout.MaxHp * AbortHealth)
        {
            Release(scout, view);
            return;
        }
        var next = _route.Peek();
        if (scout.Order.Type != OrderType.Move || Vector2.Distance(scout.Order.Point, next) > 1)
        {
            Move(scout, next);
        }
    }

    private Unit TryStart(BotView view)
    {
        if (_profile.ScoutEarly && !_scoutedEarly && view.Villagers.Count >= MinVillagers)
        {
            _scoutedEarly = true;
            var villager = view.Villagers.Where(v => v.Order.Type != OrderType.Build).OrderByDescending(v => v.Id).FirstOrDefault();
            return _memory.TryUnexploredStart(out var start) ? Begin(villager, view, start) : null;
        }
        var interval = _profile.RescoutSeconds * _game.Content.Rules.TickRate;
        var stale = view.Tick - _memory.LastArmySightingTick > interval && view.Tick - _lastScoutTick > interval;
        if (interval <= 0 || !stale || !TryRescoutTarget(view, out var target))
        {
            return null;
        }
        var soldier = view.Army.OrderByDescending(u => u.Def.Speed).ThenBy(u => u.Id).FirstOrDefault();
        return Begin(soldier, view, target);
    }

    private bool TryRescoutTarget(BotView view, out Vector2 target)
    {
        var known = _memory.Buildings.OrderBy(b => Vector2.DistanceSquared(b.Position, view.Home)).ThenBy(b => b.Id).FirstOrDefault();
        if (known != null)
        {
            target = known.Position;
            return true;
        }
        if (_memory.TryUnexploredStart(out target))
        {
            return true;
        }
        target = _memory.CandidateStarts.Count > 0 ? _memory.CandidateStarts[0] : default;
        return _memory.CandidateStarts.Count > 0;
    }

    /// <summary>Out past the map center on one side, to a lookout short of the target, and back the same way.</summary>
    private Unit Begin(Unit unit, BotView view, Vector2 target)
    {
        if (unit == null)
        {
            return null;
        }
        var heading = target - view.Home;
        var side = _player.Index % 2 == 0 ? 1f : -1f;
        var perpendicular = heading.LengthSquared() < 0.01f ? Vector2.Zero : Vector2.Normalize(new Vector2(-heading.Y, heading.X)) * side;
        var detour = _game.MapCenter + perpendicular * CenterDetour;
        _route.Clear();
        _route.Enqueue(detour);
        _route.Enqueue(BotBuilder.Toward(target, detour, StandOff));
        _route.Enqueue(detour);
        _scoutId = unit.Id;
        _lastScoutTick = view.Tick;
        return unit;
    }

    private void Release(Unit scout, BotView view)
    {
        _scoutId = 0;
        _route.Clear();
        Move(scout, view.Home);
    }

    private void Move(Unit unit, Vector2 point)
    {
        _game.Commands.Apply(_player, new MoveCommand { Units = [unit.Id], X = point.X, Y = point.Y });
    }
}
