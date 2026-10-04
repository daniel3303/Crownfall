using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>
/// Unit-level fighting for Normal and Hard bots: focus the visible soldier that removes the most enemy damage per hit
/// spent, which picks off weak units and finishes a worn-down hero, then villagers, then the objective building; archers
/// trail the melee line, units step out from under enemy meteor strikes seen being cast, and Hard bots also step archers
/// back from melee attackers and keep melee soldiers an enemy hero's ready area ability would kill out of its reach,
/// all but a few baits, until it is spent. Nobody stays locked onto a boss creep.
/// </summary>
public sealed class BotMicro
{
    private const float MeleeEngage = 2.5f;
    private const float RangedSlack = 1f;
    private const float KiteTrigger = 1.5f;
    private const float KiteStep = 2.5f;
    private const float ScreenRadius = 5f;
    private const float ArcherTrail = 3f;
    private const float OrderTolerance = 3f;
    private const float DodgeMargin = 1.5f;

    // Tiles beyond an area ability's reach a fragile soldier keeps from the hero, since both move between thinks.
    private const float AreaMargin = 1f;
    private const float AreaStepOut = 1f;

    // Fragile melee soldiers allowed inside a ready area ability's reach: enough to make the hero spend it.
    private const int AreaBaits = 3;

    // An area ability this close to coming back already counts as ready.
    private const float AreaReadySeconds = 1.5f;

    // A hero this worn down is swarmed whatever its abilities can still do.
    private const float FinishHealth = 0.2f;

    // A new target must be worth this much more before a unit drops the soldier it is already hitting.
    private const float Stickiness = 1.25f;

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotProfile _profile;
    private readonly BotCombatModel _model;
    private readonly BotMemory _memory;
    private readonly List<Unit> _nearby = [];
    private readonly SortedDictionary<int, List<int>> _attacks = [];
    private readonly List<int> _melee = [];
    private readonly List<int> _ranged = [];
    private readonly List<KnownStrike> _strikes = [];
    private readonly List<AreaThreat> _threats = [];
    private readonly List<int> _baits = [];

    public BotMicro(Game game, Player player, BotProfile profile, BotCombatModel model, BotMemory memory)
    {
        _game = game;
        _player = player;
        _profile = profile;
        _model = model;
        _memory = memory;
    }

    /// <summary>
    /// Orders each unit at its best target, or onward to <paramref name="advance"/>; plain attack-move when micro is off.
    /// <paramref name="objectiveBuilding"/> is attacked once in sight, 0 for none.
    /// </summary>
    public void Fight(BotView view, IReadOnlyList<Unit> units, Vector2 advance, int objectiveBuilding)
    {
        _attacks.Clear();
        _melee.Clear();
        _ranged.Clear();
        CollectStrikes();
        CollectAreaThreats(view, units);
        var centroid = Centroid(units);
        foreach (var unit in units)
        {
            if (TryDodge(unit) || LeaveBoss(unit, advance) || TryRespectArea(unit))
            {
                continue;
            }
            if (!_profile.Micro)
            {
                if (unit.Order.Type != OrderType.Attack && !IsHeadingTo(unit, advance))
                {
                    (unit.Def.IsRanged ? _ranged : _melee).Add(unit.Id);
                }
                continue;
            }
            if (_profile.Kite && TryKite(unit, centroid))
            {
                continue;
            }
            var target = PickTarget(unit) ?? ObjectiveTarget(unit, objectiveBuilding);
            if (target != null)
            {
                Attack(unit, target);
            }
            else if (!IsHeadingTo(unit, advance))
            {
                (unit.Def.IsRanged ? _ranged : _melee).Add(unit.Id);
            }
        }
        IssueAttacks();
        IssueAdvance(advance, centroid);
    }

    /// <summary>Enemy meteor strikes the team saw being cast and that have not landed yet.</summary>
    private void CollectStrikes()
    {
        _strikes.Clear();
        if (_profile.Dodge)
        {
            _strikes.AddRange(_memory.Strikes.Where(s => s.ImpactTick >= _game.Tick));
        }
    }

    /// <summary>
    /// Visible enemy heroes whose area ability around themselves is ready, or nearly, and kills; for each, the fragile melee
    /// soldiers nearest it, up to the bait count, may still fight it.
    /// </summary>
    private void CollectAreaThreats(BotView view, IReadOnlyList<Unit> units)
    {
        _threats.Clear();
        _baits.Clear();
        if (!_profile.RespectAreaAbilities)
        {
            return;
        }
        var soon = (int)(AreaReadySeconds * _game.Content.Rules.TickRate);
        foreach (var hero in view.EnemyUnits.Where(u => u.IsHero && u.Hp > u.MaxHp * FinishHealth))
        {
            var level = hero.Hero.Level;
            var abilities = hero.Def.Kit;
            for (var slot = 0; slot < abilities.Count; slot++)
            {
                var ability = abilities[slot];
                if (ability.Effect == AbilityEffect.Nova && level >= ability.UnlockLevel && _memory.AbilityReadyTick(hero, slot) <= _game.Tick + soon)
                {
                    var threat = new AreaThreat(hero, ability.Radius, ability.DamageAt(level));
                    _threats.Add(threat);
                    _baits.AddRange(units.Where(u => IsFragile(u, threat) && InReach(u.Position, u.Radius, threat))
                        .OrderBy(u => Vector2.DistanceSquared(u.Position, hero.Position))
                        .ThenBy(u => u.Id)
                        .Take(AreaBaits)
                        .Select(u => u.Id));
                }
            }
        }
    }

    /// <summary>A fragile melee soldier inside a ready area ability's reach that is not one of its baits steps back out.</summary>
    private bool TryRespectArea(Unit unit)
    {
        if (_baits.Contains(unit.Id))
        {
            return false;
        }
        foreach (var threat in _threats)
        {
            if (!IsFragile(unit, threat) || !InReach(unit.Position, unit.Radius, threat))
            {
                continue;
            }
            var away = unit.Position - threat.Hero.Position;
            var direction = away.LengthSquared() < 0.0001f ? Vector2.UnitX : Vector2.Normalize(away);
            var exit = threat.Hero.Position + direction * (threat.Radius + unit.Radius + AreaMargin + AreaStepOut);
            _game.Commands.Apply(_player, new MoveCommand { Units = [unit.Id], X = exit.X, Y = exit.Y });
            return true;
        }
        return false;
    }

    /// <summary>True when the area ability would kill this melee soldier outright.</summary>
    private static bool IsFragile(Unit unit, AreaThreat threat)
    {
        return !unit.Def.IsRanged && !unit.IsHero && unit.Hp <= threat.Damage;
    }

    private static bool InReach(Vector2 point, float radius, AreaThreat threat)
    {
        return Vector2.Distance(point, threat.Hero.Position) <= threat.Radius + radius + AreaMargin;
    }

    /// <summary>True when a fragile melee soldier, not a bait, would have to stand inside a ready area ability to hit the enemy.</summary>
    private bool IsGuarded(Unit unit, Unit enemy)
    {
        if (_threats.Count == 0 || _baits.Contains(unit.Id))
        {
            return false;
        }
        foreach (var threat in _threats)
        {
            if (IsFragile(unit, threat) && InReach(enemy.Position, enemy.Radius + unit.Def.Range, threat))
            {
                return true;
            }
        }
        return false;
    }

    private bool TryDodge(Unit unit)
    {
        foreach (var strike in _strikes)
        {
            var reach = strike.Radius + DodgeMargin;
            if (Vector2.Distance(unit.Position, strike.Point) < reach)
            {
                var exit = BotBuilder.Toward(strike.Point, unit.Position, reach);
                _game.Commands.Apply(_player, new MoveCommand { Units = [unit.Id], X = exit.X, Y = exit.Y });
                return true;
            }
        }
        return false;
    }

    /// <summary>Walks a unit out of a fight with a boss creep it was drawn into; boss camps are routed around, never fought.</summary>
    private bool LeaveBoss(Unit unit, Vector2 advance)
    {
        if (unit.Order.Target is not Unit { Owner: null } creep || !creep.Def.HasTag("boss"))
        {
            return false;
        }
        _game.Commands.Apply(_player, new MoveCommand { Units = [unit.Id], X = advance.X, Y = advance.Y });
        return true;
    }

    private Unit PickTarget(Unit unit)
    {
        _nearby.Clear();
        _game.Spatial.Query(unit.Position, unit.AcquireRange + 1, _nearby.Add);
        Unit best = null;
        var bestValue = 0f;
        Unit nearestSoldier = null;
        Unit nearestVillager = null;
        var soldierDistance = float.MaxValue;
        var villagerDistance = float.MaxValue;
        foreach (var enemy in _nearby)
        {
            if (!IsEnemy(enemy) || IsGuarded(unit, enemy))
            {
                continue;
            }
            var distance = enemy.EdgeDistance(unit.Position) - unit.Radius;
            if (enemy.Def.IsVillager)
            {
                (nearestVillager, villagerDistance) = distance < villagerDistance ? (enemy, distance) : (nearestVillager, villagerDistance);
                continue;
            }
            if (distance < soldierDistance)
            {
                (nearestSoldier, soldierDistance) = (enemy, distance);
            }
            var engage = unit.Def.IsRanged ? unit.Def.Range + RangedSlack : MeleeEngage;
            var value = KillValue(unit, enemy);
            if (distance <= engage && (value > bestValue || value == bestValue && best != null && enemy.Id < best.Id))
            {
                (best, bestValue) = (enemy, value);
            }
        }
        best = KeepCurrent(unit, best, bestValue) ?? nearestSoldier;
        return best ?? nearestVillager;
    }

    /// <summary>Enemy damage per second removed per hit this unit needs to kill the target.</summary>
    private float KillValue(Unit unit, Unit enemy)
    {
        var hits = MathF.Ceiling(enemy.Hp / BotCombatModel.HitDamage(unit, enemy));
        return _model.ThreatDps(enemy) / MathF.Max(1, hits);
    }

    /// <summary>Keeps hitting the current soldier unless the new pick is clearly worth more, which avoids re-pathing every think.</summary>
    private Unit KeepCurrent(Unit unit, Unit best, float bestValue)
    {
        if (unit.Order is not { Type: OrderType.Attack, Target: Unit current } || !IsEnemy(current) || current.Def.IsVillager || IsGuarded(unit, current))
        {
            return best;
        }
        var engage = unit.Def.IsRanged ? unit.Def.Range + RangedSlack : MeleeEngage;
        if (current.EdgeDistance(unit.Position) - unit.Radius > engage)
        {
            return best;
        }
        return best == null || KillValue(unit, current) * Stickiness >= bestValue ? current : best;
    }

    private Entity ObjectiveTarget(Unit unit, int buildingId)
    {
        if (buildingId == 0 || _game.Entities.Get(buildingId) is not Building { IsAlive: true } building)
        {
            return null;
        }
        var near = building.EdgeDistance(unit.Position) <= unit.AcquireRange;
        return near && _game.Vision.IsVisible(_player.Team, building) ? building : null;
    }

    /// <summary>An archer that just fired steps back behind its own melee when an enemy melee unit closes in.</summary>
    private bool TryKite(Unit unit, Vector2 centroid)
    {
        if (!unit.Def.IsRanged || unit.AttackCooldown <= 0)
        {
            return false;
        }
        _nearby.Clear();
        _game.Spatial.Query(unit.Position, ScreenRadius, _nearby.Add);
        var threat = _nearby.FirstOrDefault(u => IsEnemy(u) && !u.Def.IsRanged && !u.Def.IsVillager && u.EdgeDistance(unit.Position) <= KiteTrigger);
        var screened = _nearby.Any(u => u.Owner == _player && u.IsAlive && u.Def.IsMilitary && !u.Def.IsRanged);
        if (threat == null || !screened)
        {
            return false;
        }
        var away = unit.Position - threat.Position + (centroid - unit.Position) * 0.5f;
        var step = away.LengthSquared() < 0.01f ? unit.Position : unit.Position + Vector2.Normalize(away) * KiteStep;
        _game.Commands.Apply(_player, new MoveCommand { Units = [unit.Id], X = step.X, Y = step.Y });
        return true;
    }

    private void Attack(Unit unit, Entity target)
    {
        if (unit.Order.Type == OrderType.Attack && unit.Order.Target == target)
        {
            return;
        }
        if (!_attacks.TryGetValue(target.Id, out var ids))
        {
            ids = [];
            _attacks[target.Id] = ids;
        }
        ids.Add(unit.Id);
    }

    private void IssueAttacks()
    {
        foreach (var (target, ids) in _attacks)
        {
            _game.Commands.Apply(_player, new AttackCommand { Units = ids, Target = target });
        }
    }

    /// <summary>Melee advance on the objective; archers aim a few tiles short so they arrive behind the melee.</summary>
    private void IssueAdvance(Vector2 objective, Vector2 centroid)
    {
        if (_melee.Count > 0)
        {
            _game.Commands.Apply(_player, new MoveCommand { Units = [.. _melee], X = objective.X, Y = objective.Y, AttackMove = true });
        }
        if (_ranged.Count > 0)
        {
            var trail = _melee.Count > 0 ? BotBuilder.Toward(objective, centroid, ArcherTrail) : objective;
            _game.Commands.Apply(_player, new MoveCommand { Units = [.. _ranged], X = trail.X, Y = trail.Y, AttackMove = true });
        }
    }

    private bool IsEnemy(Unit unit)
    {
        return unit.IsAlive && unit.Owner != null && unit.Team != _player.Team && _game.Vision.IsVisible(_player.Team, unit);
    }

    private static bool IsHeadingTo(Unit unit, Vector2 objective)
    {
        return unit.Order.Type is OrderType.AttackMove && Vector2.Distance(unit.Order.Point, objective) <= OrderTolerance + ArcherTrail
            || unit.Order is { Type: OrderType.Attack, IsAuto: true };
    }

    private static Vector2 Centroid(IReadOnlyList<Unit> units)
    {
        if (units.Count == 0)
        {
            return Vector2.Zero;
        }
        var sum = Vector2.Zero;
        foreach (var unit in units)
        {
            sum += unit.Position;
        }
        return sum / units.Count;
    }
}
