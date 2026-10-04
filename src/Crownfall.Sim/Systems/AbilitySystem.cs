using System.Numerics;
using Crownfall.Sim.Content;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;

namespace Crownfall.Sim.Systems;

/// <summary>Hero abilities: casting, cooldowns, buffs, delayed strikes and the charge dash.</summary>
public sealed class AbilitySystem
{
    private const float DashTraceStep = 0.2f;
    private const float MinDashDistance = 1f;

    private readonly Game _game;
    private readonly List<Unit> _nearby = [];

    public AbilitySystem(Game game)
    {
        _game = game;
    }

    public void Update()
    {
        foreach (var player in _game.Players)
        {
            var cooldowns = player.HeroState.Cooldowns;
            for (var i = 0; i < cooldowns.Length; i++)
            {
                cooldowns[i] = MathF.Max(0, cooldowns[i] - _game.Dt);
            }
            if (player.Hero is { IsAlive: true, Dash: not null } hero)
            {
                AdvanceDash(hero);
            }
        }
    }

    public void Cast(Player player, int slot, Vector2 target)
    {
        var ability = _game.Content.Ability(slot);
        var hero = player.Hero;
        if (ability == null)
        {
            return;
        }
        if (hero == null || !hero.IsAlive)
        {
            _game.Notify(player, "Your hero is not on the field.", NoticeTone.Warning, null);
            return;
        }
        var state = player.HeroState;
        if (state.Level < ability.UnlockLevel)
        {
            _game.Notify(player, $"{ability.Name} unlocks at hero level {ability.UnlockLevel}.", NoticeTone.Warning, null);
            return;
        }
        if (state.Cooldowns[slot] > 0)
        {
            _game.Notify(player, $"{ability.Name} is recharging.", NoticeTone.Warning, null);
            return;
        }
        if (hero.IsStunned(_game.Tick) || hero.Dash != null)
        {
            return;
        }
        var point = AimPoint(hero, ability, target);
        if (ability.Effect == AbilityEffect.Dash && Vector2.Distance(hero.Position, point) < MinDashDistance)
        {
            _game.Notify(player, "No room to charge there.", NoticeTone.Warning, null);
            return;
        }
        state.Cooldowns[slot] = ability.Cooldown * _game.Content.Rules.HeroCooldownFactor(state.Level);
        var delayTicks = DelayTicks(hero, ability, point);
        _game.Events.Add(new AbilityEvent
        {
            Player = player.Index,
            Team = player.Team,
            Hero = hero.Id,
            Slot = slot,
            X = point.X,
            Y = point.Y,
            Radius = ability.Radius,
            DelayTicks = delayTicks,
        });
        Resolve(player, hero, ability, point, delayTicks);
    }

    private void Resolve(Player player, Unit hero, AbilityDef ability, Vector2 point, int delayTicks)
    {
        var level = player.HeroState.Level;
        switch (ability.Effect)
        {
            case AbilityEffect.Nova:
                CastNova(hero, ability, level);
                break;
            case AbilityEffect.Buff:
                CastBuff(hero, ability);
                break;
            case AbilityEffect.Strike:
                _game.Combat.Strikes.Add(new PendingStrike
                {
                    Owner = player,
                    Caster = hero,
                    Ability = ability,
                    Point = point,
                    Damage = ability.DamageAt(level),
                    ImpactTick = _game.Tick + delayTicks,
                });
                break;
            case AbilityEffect.Dash:
                OrderSystem.SetIdle(hero);
                hero.Dash = new DashState { Ability = ability, Target = point, Damage = ability.DamageAt(level) };
                break;
        }
    }

    private Vector2 AimPoint(Unit hero, AbilityDef ability, Vector2 target)
    {
        return ability.Effect switch
        {
            AbilityEffect.Strike => ClampToRange(hero.Position, target, ability.Range),
            AbilityEffect.Dash => DashEnd(hero, ClampToRange(hero.Position, target, ability.Range)),
            _ => hero.Position,
        };
    }

    private int DelayTicks(Unit hero, AbilityDef ability, Vector2 point)
    {
        return ability.Effect switch
        {
            AbilityEffect.Strike => (int)MathF.Ceiling(ability.Delay * _game.Content.Rules.TickRate),
            AbilityEffect.Dash => (int)MathF.Ceiling(Vector2.Distance(hero.Position, point) / (ability.Speed * _game.Dt)),
            _ => 0,
        };
    }

    /// <summary>The farthest point along the line the hero can stand on; a charge stops short of walls and water.</summary>
    private Vector2 DashEnd(Unit hero, Vector2 target)
    {
        var start = hero.Position;
        var distance = Vector2.Distance(start, target);
        var steps = (int)MathF.Ceiling(distance / DashTraceStep);
        var end = start;
        for (var i = 1; i <= steps; i++)
        {
            var point = Vector2.Lerp(start, target, i / (float)steps);
            if (!_game.Map.IsWalkable(point, hero.Team))
            {
                break;
            }
            end = point;
        }
        return end;
    }

    /// <summary>Moves a charging hero one tick along its line; a tile blocked since the cast ends the charge early.</summary>
    private void AdvanceDash(Unit hero)
    {
        var dash = hero.Dash;
        var delta = dash.Target - hero.Position;
        var distance = delta.Length();
        var step = dash.Ability.Speed * _game.Dt;
        var next = distance <= step ? dash.Target : hero.Position + delta / distance * step;
        if (_game.Map.IsWalkable(next, hero.Team))
        {
            hero.Position = next;
        }
        if (distance > 0.0001f)
        {
            hero.Facing = MathF.Atan2(delta.Y, delta.X);
        }
        hero.Activity = UnitActivity.Move;
        HitAlongDash(hero, dash);
        if (hero.Position == dash.Target || next != hero.Position)
        {
            hero.Dash = null;
        }
    }

    private void HitAlongDash(Unit hero, DashState dash)
    {
        var ability = dash.Ability;
        var stunTicks = (int)MathF.Ceiling(ability.Stun * _game.Content.Rules.TickRate);
        _nearby.Clear();
        _game.Spatial.Query(hero.Position, ability.Radius + 1, _nearby.Add);
        foreach (var unit in _nearby)
        {
            if (!unit.IsAlive || !CombatSystem.AreEnemies(hero, unit) || unit.EdgeDistance(hero.Position) > ability.Radius || !dash.Hits.Add(unit.Id))
            {
                continue;
            }
            unit.StunUntilTick = Math.Max(unit.StunUntilTick, _game.Tick + stunTicks);
            _game.Combat.Damage(unit, dash.Damage, hero, hero.Owner);
        }
    }

    private void CastNova(Unit hero, AbilityDef ability, int level)
    {
        _nearby.Clear();
        _game.Spatial.Query(hero.Position, ability.Radius + 0.5f, _nearby.Add);
        foreach (var unit in _nearby)
        {
            if (unit.IsAlive && CombatSystem.AreEnemies(hero, unit) && unit.EdgeDistance(hero.Position) <= ability.Radius)
            {
                _game.Combat.Damage(unit, ability.DamageAt(level), hero, hero.Owner);
            }
        }
    }

    private void CastBuff(Unit hero, AbilityDef ability)
    {
        _nearby.Clear();
        _game.Spatial.Query(hero.Position, ability.Radius, _nearby.Add);
        var until = _game.Tick + (int)(ability.Duration * _game.Content.Rules.TickRate);
        foreach (var unit in _nearby)
        {
            if (unit.IsAlive && unit.Owner != null && unit.Team == hero.Team)
            {
                unit.Buff = ability;
                unit.BuffUntilTick = until;
            }
        }
    }

    private static Vector2 ClampToRange(Vector2 origin, Vector2 target, float range)
    {
        var delta = target - origin;
        var length = delta.Length();
        return length <= range || length < 0.0001f ? target : origin + delta / length * range;
    }
}
