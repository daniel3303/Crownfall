using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>Spots enemy fighters in the base or on villagers, and moves endangered villagers out of their reach.</summary>
public sealed class BotVillagerGuard
{
    private const float BaseRadius = 14f;
    private const float VillagerRadius = 6f;
    private const float FleeRadius = 5f;
    private const float FleeDistance = 9f;
    private const float GuardRadius = 16f;

    // A villager that fled goes back to work once no attacker has been near it for this long.
    private const int ShelterTicks = 150;

    // Enemies further than this from home cannot be near any of the bot's buildings, which skips the per-building check.
    private const float BaseSpan = 60f;

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotProfile _profile;
    private readonly BotCombatModel _model;
    private readonly Dictionary<int, int> _sheltering = [];
    private readonly List<Unit> _nearby = [];

    public BotVillagerGuard(Game game, Player player, BotProfile profile, BotCombatModel model)
    {
        _game = game;
        _player = player;
        _profile = profile;
        _model = model;
    }

    public BotThreat Threat { get; } = new();

    public void Scan(BotView view)
    {
        Threat.Attackers.Clear();
        var center = Vector2.Zero;
        var power = 0f;
        foreach (var enemy in view.EnemyUnits)
        {
            var thief = enemy.Order.Target is Building robbed && robbed.Owner == _player;
            if ((enemy.Def.IsMilitary || enemy.IsHero || thief) && (NearBuildings(view, enemy) || _profile.DefendVillagers && NearVillagers(enemy)))
            {
                Threat.Attackers.Add(enemy);
                center += enemy.Position;
                power += _model.Power(enemy);
            }
        }
        Threat.Center = Threat.IsActive ? center / Threat.Attackers.Count : view.Home;
        Threat.Power = power;
    }

    /// <summary>True for a villager that fled while the threat lasts; the economy leaves it alone.</summary>
    public bool IsSheltering(Unit villager)
    {
        return _sheltering.ContainsKey(villager.Id);
    }

    /// <summary>Villagers near attackers run toward a defending army that outweighs the threat, otherwise straight away from it.</summary>
    public void Protect(BotView view)
    {
        if (!Threat.IsActive)
        {
            _sheltering.Clear();
            return;
        }
        if (!_profile.VillagersFlee)
        {
            return;
        }
        var guarded = TryGuardPoint(view, out var guard);
        foreach (var villager in view.Villagers)
        {
            var attacker = NearestAttacker(villager);
            if (attacker == null)
            {
                if (_sheltering.TryGetValue(villager.Id, out var since) && view.Tick - since >= ShelterTicks)
                {
                    _sheltering.Remove(villager.Id);
                }
                continue;
            }
            _sheltering[villager.Id] = view.Tick;
            if (villager.Order.Type == OrderType.Move)
            {
                continue;
            }
            var destination = guarded ? guard : BotBuilder.Toward(villager.Position, villager.Position * 2 - attacker.Position, FleeDistance);
            Issue(new MoveCommand { Units = [villager.Id], X = destination.X, Y = destination.Y });
        }
    }

    private bool NearBuildings(BotView view, Unit enemy)
    {
        if (Vector2.Distance(enemy.Position, view.Home) > BaseSpan)
        {
            return false;
        }
        foreach (var building in view.Buildings)
        {
            if (building.EdgeDistance(enemy.Position) <= BaseRadius)
            {
                return true;
            }
        }
        return false;
    }

    private bool NearVillagers(Unit enemy)
    {
        _nearby.Clear();
        _game.Spatial.Query(enemy.Position, VillagerRadius, _nearby.Add);
        return _nearby.Any(u => u.Owner == _player && u.Def.IsVillager && u.IsAlive);
    }

    private Unit NearestAttacker(Unit villager)
    {
        Unit nearest = null;
        var best = FleeRadius;
        foreach (var attacker in Threat.Attackers)
        {
            var distance = Vector2.Distance(attacker.Position, villager.Position);
            if (distance <= best)
            {
                best = distance;
                nearest = attacker;
            }
        }
        return nearest;
    }

    /// <summary>Where the bot's own soldiers near the threat stand, when they outweigh it.</summary>
    private bool TryGuardPoint(BotView view, out Vector2 point)
    {
        var sum = Vector2.Zero;
        var count = 0;
        var power = 0f;
        foreach (var unit in view.Army)
        {
            if (Vector2.Distance(unit.Position, Threat.Center) <= GuardRadius)
            {
                sum += unit.Position;
                count++;
                power += _model.Power(unit);
            }
        }
        point = count > 0 ? sum / count : view.Home;
        return count > 0 && power >= Threat.Power;
    }

    private void Issue(PlayerCommand command)
    {
        _game.Commands.Apply(_player, command);
    }
}
