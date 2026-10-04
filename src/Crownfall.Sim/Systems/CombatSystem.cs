using System.Numerics;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;

namespace Crownfall.Sim.Systems;

/// <summary>Targeting, damage, arrows in flight, building attacks and delayed ability strikes.</summary>
public sealed class CombatSystem
{
    private const float CreepTargetSightFactor = 2f;
    private readonly Game _game;
    private readonly List<Unit> _candidates = [];
    private readonly List<Unit> _splashed = [];

    public CombatSystem(Game game)
    {
        _game = game;
    }

    public List<Projectile> Projectiles { get; } = [];
    public List<PendingStrike> Strikes { get; } = [];

    public static bool AreEnemies(Entity a, Entity b)
    {
        return a.Team != b.Team && (a.Owner != null || b.Owner != null);
    }

    /// <summary>True when the unit may keep attacking the target this tick.</summary>
    public bool CanAttack(Unit attacker, Entity target)
    {
        if (target == null || !target.IsAlive || target is ResourceNode || !AreEnemies(attacker, target))
        {
            return false;
        }
        if (attacker.Owner == null)
        {
            return target is Unit && Vector2.Distance(attacker.Position, target.Position) <= attacker.Sight * CreepTargetSightFactor;
        }
        return _game.Vision.IsVisible(attacker.Team, target);
    }

    public Entity FindTarget(Unit unit, float radius, bool includeBuildings)
    {
        Entity best = null;
        var bestDistance = float.MaxValue;
        _candidates.Clear();
        _game.Spatial.Query(unit.Position, radius + 1, _candidates.Add);
        foreach (var candidate in _candidates)
        {
            // A passive boss such as the dragon is fought only on an explicit order, never by units passing its lair.
            if (candidate == unit || candidate.Def.IsPassive || !CanAttack(unit, candidate))
            {
                continue;
            }
            var distance = candidate.EdgeDistance(unit.Position);
            if (distance <= radius && distance < bestDistance)
            {
                bestDistance = distance;
                best = candidate;
            }
        }
        if (best != null || !includeBuildings)
        {
            return best;
        }
        foreach (var building in _game.Entities.Buildings)
        {
            // Plain walls and gates are only broken when they block the way, never picked as targets.
            if (building.Def.IsWall && building.Stats.Attack == null)
            {
                continue;
            }
            var distance = building.EdgeDistance(unit.Position);
            if (distance <= radius && distance < bestDistance && CanAttack(unit, building))
            {
                bestDistance = distance;
                best = building;
            }
        }
        return best;
    }

    public void Attack(Unit attacker, Entity target)
    {
        var damage = ComputeDamage(attacker.AttackDamage, attacker.Def.DamageType, attacker.Def.Bonus, target);
        if (attacker.Def.IsRanged)
        {
            Launch(attacker, attacker.Owner, target, damage);
            return;
        }
        var point = target.Position;
        StealLife(attacker, Damage(target, damage, attacker, attacker.Owner));
        if (attacker.Def.Splash > 0)
        {
            Splash(attacker, target, point);
        }
    }

    /// <summary>A live target's damage: a unit's own armor counts, with whatever a hero's items add to it.</summary>
    public static float ComputeDamage(float attack, DamageType type, IReadOnlyList<BonusDef> bonuses, Entity target)
    {
        return target is Unit unit
            ? ComputeDamage(attack, type, bonuses, unit.Def, unit.ArmorAgainst(type))
            : MathF.Max(1, attack - target.Armor.Against(type));
    }

    /// <summary>Damage against a unit type at its base armor, for estimates made without a live unit.</summary>
    public static float ComputeDamage(float attack, DamageType type, IReadOnlyList<BonusDef> bonuses, UnitDef target)
    {
        return ComputeDamage(attack, type, bonuses, target, target.Armor.Against(type));
    }

    private static float ComputeDamage(float attack, DamageType type, IReadOnlyList<BonusDef> bonuses, UnitDef target, float armor)
    {
        var damage = MathF.Max(1, attack - armor);
        foreach (var bonus in bonuses)
        {
            if (target.HasTag(bonus.Vs))
            {
                damage += bonus.Damage;
            }
        }
        return damage;
    }

    /// <summary>Applies damage and returns how much the target actually lost, which overkill does not count.</summary>
    public float Damage(Entity target, float amount, Entity source, Player sourceOwner)
    {
        if (!target.IsAlive || target is ResourceNode)
        {
            return 0;
        }
        var dealt = MathF.Min(amount, target.Hp);
        target.Hp -= amount;
        if (target is Unit unit)
        {
            unit.LastDamagedTick = _game.Tick;
            Retaliate(unit, source);
            if (unit.Camp != null)
            {
                _game.Creeps.OnAttacked(unit, source);
            }
        }
        if (target.Owner != null && sourceOwner != null && sourceOwner.Team != target.Team)
        {
            WarnUnderAttack(target);
        }
        if (target.Hp <= 0)
        {
            _game.Kill(target, sourceOwner);
        }
        return dealt;
    }

    /// <summary>A splashing attacker's blow also lands on every other enemy unit around the spot it struck.</summary>
    private void Splash(Unit attacker, Entity target, Vector2 point)
    {
        // No impact event: the client draws those as meteor strikes, and the attacker's own blow already shows.
        var radius = attacker.Def.Splash;
        _splashed.Clear();
        _game.Spatial.Query(point, radius + 1, _splashed.Add);
        foreach (var unit in _splashed)
        {
            if (unit != target && unit.IsAlive && AreEnemies(attacker, unit) && unit.EdgeDistance(point) <= radius)
            {
                Damage(unit, ComputeDamage(attacker.AttackDamage, attacker.Def.DamageType, attacker.Def.Bonus, unit), attacker, attacker.Owner);
            }
        }
    }

    /// <summary>A hero with life-steal ranks heals a share of what its basic attack dealt.</summary>
    private static void StealLife(Entity attacker, float dealt)
    {
        if (attacker is not Unit { Hero: not null, IsAlive: true } hero || dealt <= 0)
        {
            return;
        }
        hero.Hp = MathF.Min(hero.MaxHp, hero.Hp + dealt * hero.Hero.LifeSteal);
    }

    public void Update()
    {
        UpdateBuildingAttacks();
        UpdateProjectiles();
        UpdateStrikes();
    }

    private void Launch(Entity source, Player owner, Entity target, float damage)
    {
        var distance = Vector2.Distance(source.Position, target.Position);
        var ticks = Math.Max(1, (int)MathF.Ceiling(distance / _game.Content.Rules.ProjectileSpeed / _game.Dt));
        Projectiles.Add(new Projectile
        {
            Source = source,
            SourceOwner = owner,
            Target = target,
            Damage = damage,
            ImpactTick = _game.Tick + ticks,
        });
        _game.Events.Add(new ShotEvent
        {
            From = source.Id,
            To = target.Id,
            X = source.Position.X,
            Y = source.Position.Y,
            Tx = target.Position.X,
            Ty = target.Position.Y,
            Ticks = ticks,
        });
    }

    private void UpdateBuildingAttacks()
    {
        foreach (var building in _game.Entities.Buildings)
        {
            var attack = building.Stats.Attack;
            if (attack == null || !building.IsAlive || !building.IsComplete)
            {
                continue;
            }
            building.AttackCooldown = MathF.Max(0, building.AttackCooldown - _game.Dt);
            if (building.AttackCooldown > 0)
            {
                continue;
            }
            var target = NearestEnemyUnit(building, attack.Range);
            if (target == null)
            {
                continue;
            }
            Launch(building, building.Owner, target, ComputeDamage(attack.Damage, attack.DamageType, [], target));
            building.AttackCooldown = attack.Cooldown;
        }
    }

    private Unit NearestEnemyUnit(Building building, float range)
    {
        Unit best = null;
        var bestDistance = float.MaxValue;
        _candidates.Clear();
        _game.Spatial.Query(building.Position, range + building.Radius + 1, _candidates.Add);
        foreach (var unit in _candidates)
        {
            if (!unit.IsAlive || unit.Def.IsPassive || !AreEnemies(building, unit) || !_game.Vision.IsVisible(building.Team, unit))
            {
                continue;
            }
            var distance = building.EdgeDistance(unit.Position);
            if (distance <= range && distance < bestDistance)
            {
                bestDistance = distance;
                best = unit;
            }
        }
        return best;
    }

    private void UpdateProjectiles()
    {
        for (var i = Projectiles.Count - 1; i >= 0; i--)
        {
            var projectile = Projectiles[i];
            if (projectile.ImpactTick > _game.Tick)
            {
                continue;
            }
            Projectiles.RemoveAt(i);
            if (projectile.Target.IsAlive)
            {
                StealLife(projectile.Source, Damage(projectile.Target, projectile.Damage, projectile.Source, projectile.SourceOwner));
            }
        }
    }

    private void UpdateStrikes()
    {
        for (var i = Strikes.Count - 1; i >= 0; i--)
        {
            var strike = Strikes[i];
            if (strike.ImpactTick > _game.Tick)
            {
                continue;
            }
            Strikes.RemoveAt(i);
            Land(strike);
        }
    }

    private void Land(PendingStrike strike)
    {
        var radius = strike.Radius;
        var stunTicks = (int)MathF.Ceiling(strike.Stun * _game.Content.Rules.TickRate);
        _game.Events.Add(new ImpactEvent { Team = strike.Owner.Team, X = strike.Point.X, Y = strike.Point.Y, Radius = radius });
        _candidates.Clear();
        _game.Spatial.Query(strike.Point, radius, _candidates.Add);
        foreach (var unit in _candidates)
        {
            if (unit.IsAlive && unit.Team != strike.Owner.Team)
            {
                if (stunTicks > 0)
                {
                    unit.StunUntilTick = Math.Max(unit.StunUntilTick, _game.Tick + stunTicks);
                }
                Damage(unit, strike.Damage, strike.Caster, strike.Owner);
            }
        }
        foreach (var building in _game.Entities.Buildings.ToList())
        {
            if (building.IsAlive && building.Team != strike.Owner.Team && building.EdgeDistance(strike.Point) <= radius)
            {
                Damage(building, strike.Damage * strike.Ability.BuildingMultiplier, strike.Caster, strike.Owner);
            }
        }
    }

    private void Retaliate(Unit unit, Entity source)
    {
        if (source is not Unit attacker || !attacker.IsAlive || unit.Def.IsVillager || unit.Order.Type != OrderType.Idle)
        {
            return;
        }
        if (AreEnemies(unit, attacker))
        {
            unit.Order = UnitOrder.Attack(attacker, isAuto: true, resume: UnitOrder.Idle);
        }
    }

    private void WarnUnderAttack(Entity target)
    {
        var owner = target.Owner;
        var cooldownTicks = _game.Content.Rules.UnderAttackNoticeSeconds * _game.Content.Rules.TickRate;
        if (_game.Tick - owner.LastUnderAttackNoticeTick < cooldownTicks)
        {
            return;
        }
        owner.LastUnderAttackNoticeTick = _game.Tick;
        var text = target is Building ? "Your base is under attack!" : "Your units are under attack!";
        _game.Notify(owner, text, Events.NoticeTone.Alert, target.Position);
    }

    public static int KillValue(Entity entity)
    {
        return entity switch
        {
            Unit unit => Resources.Total(unit.Def.CostAmounts) + Resources.Total(unit.Def.BountyAmounts) + (unit.IsHero ? 200 : 0),
            Building building => Resources.Total(building.Def.CostAmounts),
            _ => 0,
        };
    }
}
