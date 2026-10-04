using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>
/// Bot hero: casts abilities when they hit several enemies, supports an attack from behind once badly hurt, and between
/// attacks rests at home until healed, then explores around home and clears the camps it finds.
/// </summary>
public sealed class BotHeroPilot
{
    private const float CreepingHealth = 0.6f;
    private const int MaxCreepingLevel = 7;
    private const float CampSearchRadius = 35f;
    private const float EnemyBaseClearance = 18f;
    private const int RallyAllies = 3;
    private const float RallyEnemyReach = 2f;
    private const float HomeRadius = 5f;

    private const float DangerRadius = 5f;
    private const float EscapeStep = 6f;
    private const float TrailDistance = 4f;

    private const float ChaserReach = 1.5f;

    // A charge opens on a group from a few tiles out, and only while the hero can take the return fire.
    private const float ChargeHealth = 0.5f;
    private const float MinChargeDistance = 3f;
    private const float ChargeGroupRadius = 2.5f;
    private const int ExploreDirections = 8;
    private static readonly float[] ExploreRadii = [22f, 34f];

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotProfile _profile;
    private readonly BotMemory _memory;
    private readonly BotTargeting _targeting;
    private readonly List<Unit> _nearby = [];

    public BotHeroPilot(Game game, Player player, BotProfile profile, BotMemory memory)
    {
        _game = game;
        _player = player;
        _profile = profile;
        _memory = memory;
        _targeting = new BotTargeting(game, memory);
    }

    public void Run(BotView view, BotMode mode)
    {
        var hero = view.Hero;
        if (hero is not { IsAlive: true })
        {
            return;
        }
        UseAbilities(hero);
        if (hero.Order.Target is Unit { Owner: null } creep && creep.Def.HasTag("boss"))
        {
            // A boss outlasts any early hero; walking off ends the fight, since creeps leash back to their camp.
            Move(hero, view.Home, attackMove: false);
            return;
        }
        if (mode == BotMode.Attacking && hero.Hp < hero.MaxHp * _profile.HeroRetreatHealth)
        {
            StayBack(hero, view);
            return;
        }
        if (mode == BotMode.Building && hero.Order.Type == OrderType.Idle && !Rest(hero, view) && !HuntCamp(hero, view))
        {
            Explore(hero, view);
        }
    }

    /// <summary>A hurt hero walks home and stays out of fights, since it only regenerates while left undamaged.</summary>
    private bool Rest(Unit hero, BotView view)
    {
        if (hero.Hp >= hero.MaxHp * CreepingHealth)
        {
            return false;
        }
        if (Vector2.Distance(hero.Position, view.Home) > HomeRadius)
        {
            Move(hero, view.Home, attackMove: false);
        }
        return true;
    }

    /// <summary>
    /// During an attack a hurt hero backs away from nearby enemies and otherwise trails the army, close enough to cast; an
    /// enemy at least as fast already on it is fought, since running would only waste its hits.
    /// </summary>
    private void StayBack(Unit hero, BotView view)
    {
        var chaser = Chaser(hero);
        if (chaser != null)
        {
            Attack(hero, chaser);
            return;
        }
        var danger = NearestEnemyFighter(hero.Position, DangerRadius);
        if (danger != null)
        {
            var escape = BotBuilder.Toward(hero.Position, view.Home, EscapeStep);
            Move(hero, escape, attackMove: false);
            return;
        }
        var post = view.Home;
        if (view.Army.Count > 0)
        {
            var centroid = new Vector2(view.Army.Average(u => u.Position.X), view.Army.Average(u => u.Position.Y));
            post = BotBuilder.Toward(centroid, view.Home, TrailDistance);
        }
        if (Vector2.Distance(hero.Position, post) > HomeRadius && !(hero.Order.Type == OrderType.Move && Vector2.Distance(hero.Order.Point, post) <= HomeRadius))
        {
            Move(hero, post, attackMove: false);
        }
    }

    private Unit NearestEnemyFighter(Vector2 point, float radius)
    {
        _nearby.Clear();
        _game.Spatial.Query(point, radius, _nearby.Add);
        return _nearby
            .Where(u => u.Owner != null && IsVisibleEnemy(u) && (u.Def.IsMilitary || u.IsHero))
            .OrderBy(u => Vector2.DistanceSquared(u.Position, point))
            .ThenBy(u => u.Id)
            .FirstOrDefault();
    }

    private Unit Chaser(Unit hero)
    {
        _nearby.Clear();
        _game.Spatial.Query(hero.Position, ChaserReach + 1, _nearby.Add);
        return _nearby
            .Where(u => u.Owner != null && IsVisibleEnemy(u) && (u.Def.IsMilitary || u.IsHero) && !u.Def.IsRanged)
            .Where(u => u.EdgeDistance(hero.Position) <= ChaserReach && u.Def.Speed >= hero.Def.Speed)
            .OrderBy(u => u.EdgeDistance(hero.Position))
            .ThenBy(u => u.Id)
            .FirstOrDefault();
    }

    private void UseAbilities(Unit hero)
    {
        var state = _player.HeroState;
        for (var slot = 0; slot < _game.Content.Abilities.Count; slot++)
        {
            var ability = _game.Content.Abilities[slot];
            if (state.Level >= ability.UnlockLevel && state.Cooldowns[slot] <= 0 && TryAim(hero, ability, out var target))
            {
                _game.Commands.Apply(_player, new AbilityCommand { Slot = slot, X = target.X, Y = target.Y });
            }
        }
    }

    private bool TryAim(Unit hero, AbilityDef ability, out Vector2 target)
    {
        target = hero.Position;
        return ability.Effect switch
        {
            AbilityEffect.Nova => CountEnemies(hero.Position, ability.Radius) >= _profile.NovaTargets,
            AbilityEffect.Buff => CountAllies(hero.Position, ability.Radius) >= RallyAllies && CountEnemies(hero.Position, ability.Radius + RallyEnemyReach) > 0,
            AbilityEffect.Dash => hero.Hp >= hero.MaxHp * ChargeHealth && TryFindCharge(hero, ability, out target),
            _ => TryFindCluster(hero, ability, out target),
        };
    }

    /// <summary>The visible enemy whose surroundings hold the most enemies, if enough to be worth the cast.</summary>
    private bool TryFindCluster(Unit hero, AbilityDef ability, out Vector2 target)
    {
        target = hero.Position;
        var best = 0;
        _nearby.Clear();
        _game.Spatial.Query(hero.Position, ability.Range, _nearby.Add);
        foreach (var candidate in _nearby.ToList())
        {
            if (candidate.Owner == null || !IsVisibleEnemy(candidate))
            {
                continue;
            }
            var count = CountEnemies(candidate.Position, ability.Radius);
            if (count > best)
            {
                best = count;
                target = candidate.Position;
            }
        }
        return best >= _profile.StrikeTargets;
    }

    /// <summary>A visible enemy fighter a few tiles away with at least the profile's nova count of enemies around it.</summary>
    private bool TryFindCharge(Unit hero, AbilityDef ability, out Vector2 target)
    {
        target = hero.Position;
        var best = 0;
        _nearby.Clear();
        _game.Spatial.Query(hero.Position, ability.Range, _nearby.Add);
        foreach (var candidate in _nearby.ToList())
        {
            var distance = Vector2.Distance(candidate.Position, hero.Position);
            if (candidate.Owner == null || !IsVisibleEnemy(candidate) || !(candidate.Def.IsMilitary || candidate.IsHero) || distance < MinChargeDistance)
            {
                continue;
            }
            var count = CountEnemies(candidate.Position, ChargeGroupRadius);
            if (count > best)
            {
                best = count;
                target = candidate.Position;
            }
        }
        return best >= _profile.NovaTargets;
    }

    private int CountEnemies(Vector2 center, float radius)
    {
        _nearby.Clear();
        _game.Spatial.Query(center, radius + 0.5f, _nearby.Add);
        return _nearby.Count(u => IsVisibleEnemy(u) && u.EdgeDistance(center) <= radius);
    }

    private int CountAllies(Vector2 center, float radius)
    {
        _nearby.Clear();
        _game.Spatial.Query(center, radius, _nearby.Add);
        return _nearby.Count(u => u.IsAlive && u.Owner != null && u.Team == _player.Team && !u.IsHero);
    }

    private bool IsVisibleEnemy(Unit unit)
    {
        return unit.IsAlive && unit.Team != _player.Team && _game.Vision.IsVisible(_player.Team, unit);
    }

    /// <summary>Clears the nearest known camp while creeps still pay experience worth the trip.</summary>
    private bool HuntCamp(Unit hero, BotView view)
    {
        if (_player.HeroState.Level >= MaxCreepingLevel)
        {
            return true;
        }
        var camp = _memory.Camps
            .Where(c => !c.HasBoss && _memory.IsCampLikelyAlive(c, view.Tick) && Vector2.Distance(c.Center, view.Home) <= CampSearchRadius)
            .OrderBy(c => Vector2.Distance(c.Center, hero.Position))
            .ThenBy(c => c.Id)
            .FirstOrDefault();
        if (camp == null)
        {
            return false;
        }
        Move(hero, camp.Center, attackMove: true);
        return true;
    }

    /// <summary>
    /// Walks to the nearest unexplored point on a ring around home, inner ring first; this is how the hero finds camps
    /// to clear and the economy finds deposits beyond the base.
    /// </summary>
    private void Explore(Unit hero, BotView view)
    {
        foreach (var radius in ExploreRadii)
        {
            Vector2? best = null;
            var bestDistance = float.MaxValue;
            for (var i = 0; i < ExploreDirections; i++)
            {
                var (sin, cos) = MathF.SinCos(i * MathF.Tau / ExploreDirections);
                var point = view.Home + new Vector2(cos, sin) * radius;
                var distance = Vector2.Distance(point, hero.Position);
                if (IsUnexplored(point) && distance < bestDistance && !_targeting.NearBoss(point) && !NearEnemyBase(point))
                {
                    bestDistance = distance;
                    best = point;
                }
            }
            if (best.HasValue)
            {
                Move(hero, best.Value, attackMove: true);
                return;
            }
        }
    }

    private bool IsUnexplored(Vector2 point)
    {
        var x = (int)point.X;
        var y = (int)point.Y;
        return _game.Map.InBounds(x, y) && !_game.Vision.IsTileExplored(_player.Team, x, y);
    }

    private bool NearEnemyBase(Vector2 point)
    {
        return _memory.Buildings.Any(b => Vector2.Distance(b.Position, point) < EnemyBaseClearance)
            || _memory.CandidateStarts.Any(c => Vector2.Distance(c, point) < EnemyBaseClearance);
    }

    private void Attack(Unit hero, Unit target)
    {
        if (hero.Order.Type != OrderType.Attack || hero.Order.Target != target)
        {
            _game.Commands.Apply(_player, new AttackCommand { Units = [hero.Id], Target = target.Id });
        }
    }

    private void Move(Unit hero, Vector2 point, bool attackMove)
    {
        _game.Commands.Apply(_player, new MoveCommand { Units = [hero.Id], X = point.X, Y = point.Y, AttackMove = attackMove });
    }
}
