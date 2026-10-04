using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>
/// Bot hero: casts its kit's abilities when they hit several enemies, or the dragon while the army slays it, heals once
/// enough allied health is missing, supports an attack from behind once badly hurt, blinking clear of a close enemy, and
/// between attacks rests at home until healed, then explores around home and clears the camps it finds. A roaming hero
/// searches further, and once nothing is left to hunt it waits with the army.
/// </summary>
public sealed class BotHeroPilot
{
    private const float CreepingHealth = 0.6f;
    private const int MaxCreepingLevel = 7;
    private const float CampSearchRadius = 35f;
    private const float EnemyBaseClearance = 18f;

    // A roaming hero hunts camps this far from home, all but those near an enemy base.
    private const float RoamRadius = 60f;

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

    // A heal is cast once it would restore at least this many times its per-unit amount across the hero and its allies.
    private const float HealWorth = 1.5f;
    private const int ExploreDirections = 8;
    private static readonly float[] ExploreRadii = [22f, 34f];
    private static readonly float[] RoamRadii = [22f, 34f, 46f];

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotProfile _profile;
    private readonly BotMemory _memory;
    private readonly BotTargeting _targeting;
    private readonly List<Unit> _nearby = [];
    private readonly HashSet<Vector2> _unreachable = [];
    private Vector2? _exploring;

    public BotHeroPilot(Game game, Player player, BotProfile profile, BotMemory memory)
    {
        _game = game;
        _player = player;
        _profile = profile;
        _memory = memory;
        _targeting = new BotTargeting(game, memory);
    }

    /// <summary>
    /// One think for the hero; <paramref name="wantsShop"/> sends an idle hero home to buy its next item, and a roaming hero
    /// with nothing to do waits at <paramref name="rally"/>.
    /// </summary>
    public void Run(BotView view, BotMode mode, bool wantsShop, Vector2 rally)
    {
        var hero = view.Hero;
        if (hero is not { IsAlive: true })
        {
            _exploring = null;
            return;
        }
        UseAbilities(hero, view, mode);
        if (mode != BotMode.Building || hero.Dash != null)
        {
            // Only an explore walk the hero ends on its own counts against the point; a charge idles it mid-walk.
            _exploring = null;
        }
        if (mode != BotMode.Slaying && hero.Order.Target is Unit { Owner: null } creep && creep.Def.HasTag("boss"))
        {
            // A boss outlasts any early hero; walking off ends the fight, since creeps leash back to their camp.
            _exploring = null;
            Move(hero, view.Home, attackMove: false);
            return;
        }
        if (mode is BotMode.Attacking or BotMode.Slaying && hero.Hp < hero.MaxHp * _profile.HeroRetreatHealth)
        {
            StayBack(hero, view);
            return;
        }
        if (mode != BotMode.Building || hero.Order.Type != OrderType.Idle)
        {
            return;
        }
        if (Rest(hero, view) || GoShopping(hero, view, wantsShop) || HuntCamp(hero, view))
        {
            _exploring = null;
            return;
        }
        Explore(hero, view, rally);
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
            if (TryEscape(hero, view))
            {
                return;
            }
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

    private void UseAbilities(Unit hero, BotView view, BotMode mode)
    {
        var state = _player.HeroState;
        var dragon = mode == BotMode.Slaying ? view.Creeps.FirstOrDefault(c => c.Camp is { IsLair: true }) : null;
        for (var slot = 0; slot < state.Kit.Count; slot++)
        {
            if (Ready(slot) && (TryAimAtBoss(hero, state.Kit[slot], dragon, out var target) || TryAim(hero, state.Kit[slot], out target)))
            {
                Cast(slot, target);
            }
        }
    }

    private bool Ready(int slot)
    {
        var state = _player.HeroState;
        return state.Level >= state.Kit[slot].UnlockLevel && state.Cooldowns[slot] <= 0;
    }

    private void Cast(int slot, Vector2 target)
    {
        _game.Commands.Apply(_player, new AbilityCommand { Slot = slot, X = target.X, Y = target.Y });
    }

    /// <summary>A damaging ability that reaches the boss the army is fighting is spent on it.</summary>
    private bool TryAimAtBoss(Unit hero, AbilityDef ability, Unit boss, out Vector2 target)
    {
        target = boss?.Position ?? hero.Position;
        if (boss == null || ability.Damage <= 0)
        {
            return false;
        }
        var distance = boss.EdgeDistance(hero.Position);
        return ability.Effect switch
        {
            AbilityEffect.Nova => distance <= Radius(ability),
            AbilityEffect.Strike => distance <= Range(ability),
            _ => false,
        };
    }

    /// <summary>
    /// Whether an ability is worth casting now and where. A dash that neither hits nor stuns is kept for escapes, and a
    /// heal waits until it would restore enough health.
    /// </summary>
    private bool TryAim(Unit hero, AbilityDef ability, out Vector2 target)
    {
        target = hero.Position;
        return ability.Effect switch
        {
            AbilityEffect.Nova => CountEnemies(hero.Position, Radius(ability)) >= _profile.NovaTargets,
            AbilityEffect.Buff => CountAllies(hero.Position, Radius(ability)) >= RallyAllies && CountEnemies(hero.Position, Radius(ability) + RallyEnemyReach) > 0,
            AbilityEffect.Heal => MissingHealth(hero.Position, Radius(ability), _player.HeroState.AbilityHeal(ability)) >= _player.HeroState.AbilityHeal(ability) * HealWorth,
            AbilityEffect.Dash => IsStriking(ability) && hero.Hp >= hero.MaxHp * ChargeHealth && TryFindCharge(hero, ability, out target),
            _ => TryFindCluster(hero, ability, out target),
        };
    }

    private static bool IsStriking(AbilityDef ability)
    {
        return ability.Damage > 0 || ability.Stun > 0;
    }

    private float Radius(AbilityDef ability)
    {
        return _player.HeroState.AbilityRadius(ability);
    }

    private float Range(AbilityDef ability)
    {
        return _player.HeroState.AbilityRange(ability);
    }

    /// <summary>Health a heal of this size would restore to the hero and its allies around a point.</summary>
    private float MissingHealth(Vector2 center, float radius, float heal)
    {
        _nearby.Clear();
        _game.Spatial.Query(center, radius, _nearby.Add);
        return _nearby.Where(u => u.IsAlive && u.Owner != null && u.Team == _player.Team).Sum(u => MathF.Min(heal, u.MaxHp - u.Hp));
    }

    /// <summary>
    /// A hurt hero with an enemy close uses a blink or a roll to jump toward home; true when it is dashing. A cast refused
    /// for want of room, as with a wall on the way home, leaves the hero to walk.
    /// </summary>
    private bool TryEscape(Unit hero, BotView view)
    {
        var kit = _player.HeroState.Kit;
        for (var slot = 0; slot < kit.Count; slot++)
        {
            if (kit[slot].Effect == AbilityEffect.Dash && !IsStriking(kit[slot]) && Ready(slot))
            {
                Cast(slot, BotBuilder.Toward(hero.Position, view.Home, Range(kit[slot])));
                return hero.Dash != null;
            }
        }
        return false;
    }

    /// <summary>The visible enemy whose surroundings hold the most enemies, if enough to be worth the cast.</summary>
    private bool TryFindCluster(Unit hero, AbilityDef ability, out Vector2 target)
    {
        target = hero.Position;
        var best = 0;
        var radius = Radius(ability);
        _nearby.Clear();
        _game.Spatial.Query(hero.Position, Range(ability), _nearby.Add);
        foreach (var candidate in _nearby.ToList())
        {
            if (candidate.Owner == null || !IsVisibleEnemy(candidate))
            {
                continue;
            }
            var count = CountEnemies(candidate.Position, radius);
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
        _game.Spatial.Query(hero.Position, Range(ability), _nearby.Add);
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

    /// <summary>Walks an idle hero home when an item it can afford waits at the town center.</summary>
    private bool GoShopping(Unit hero, BotView view, bool wantsShop)
    {
        if (!wantsShop || view.TownCenter == null)
        {
            return false;
        }
        Move(hero, view.TownCenter.Position, attackMove: false);
        return true;
    }

    /// <summary>
    /// Clears the nearest known camp while creeps still pay experience worth the trip; past that level a roaming hero
    /// keeps exploring and then waits at the rally; other heroes stay where they stand.
    /// </summary>
    private bool HuntCamp(Unit hero, BotView view)
    {
        if (_player.HeroState.Level >= MaxCreepingLevel)
        {
            // Claiming the think keeps other heroes where they stand; a roaming hero falls through to explore.
            return !_profile.HeroRoams;
        }
        var reach = _profile.HeroRoams ? RoamRadius : CampSearchRadius;
        var camp = _memory.Camps
            .Where(c => !c.HasBoss && _memory.IsCampLikelyAlive(c, view.Tick) && Vector2.Distance(c.Center, view.Home) <= reach)
            .Where(c => !_profile.HeroRoams || !NearEnemyBase(c.Center))
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
    /// to clear and the economy finds deposits beyond the base. A roaming hero also searches a wider ring, drops points
    /// it stopped short of, and with none left walks to <paramref name="rally"/>.
    /// </summary>
    private void Explore(Unit hero, BotView view, Vector2 rally)
    {
        if (_profile.HeroRoams && _exploring is { } target && IsUnexplored(target))
        {
            // The hero went idle on its way there and the point is still unexplored: trees hide it or bar the path.
            _unreachable.Add(target);
        }
        _exploring = null;
        foreach (var radius in _profile.HeroRoams ? RoamRadii : ExploreRadii)
        {
            Vector2? best = null;
            var bestDistance = float.MaxValue;
            for (var i = 0; i < ExploreDirections; i++)
            {
                var (sin, cos) = MathF.SinCos(i * MathF.Tau / ExploreDirections);
                var point = view.Home + new Vector2(cos, sin) * radius;
                var distance = Vector2.Distance(point, hero.Position);
                if (IsUnexplored(point) && distance < bestDistance && !_targeting.NearBoss(point) && !NearEnemyBase(point) && !_unreachable.Contains(point))
                {
                    bestDistance = distance;
                    best = point;
                }
            }
            if (best.HasValue)
            {
                _exploring = best;
                Move(hero, best.Value, attackMove: true);
                return;
            }
        }
        if (_profile.HeroRoams && Vector2.Distance(hero.Position, rally) > HomeRadius)
        {
            Move(hero, rally, attackMove: true);
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
