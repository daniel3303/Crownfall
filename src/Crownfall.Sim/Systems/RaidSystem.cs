using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;

namespace Crownfall.Sim.Systems;

/// <summary>
/// Villagers stealing from an enemy drop-off: they load whole units from the owner's stockpile, never more than it
/// holds, then carry the loot home like any cargo. The robbed player is warned at most once per notice interval.
/// </summary>
public sealed class RaidSystem
{
    private readonly Game _game;

    public RaidSystem(Game game)
    {
        _game = game;
    }

    private float Capacity => _game.Content.Rules.CarryCapacity;

    /// <summary>A completed enemy drop-off building can be robbed.</summary>
    public static bool IsRaidable(Building building, Player thief)
    {
        return building.IsAlive && building.IsComplete && building.Def.IsDropOff && building.Owner != null && building.Team != thief.Team;
    }

    public static bool IsRaid(UnitOrder order, Player thief)
    {
        return order.Target is Building building && building.Owner != null && building.Team != thief.Team;
    }

    public void Update(Unit unit, Building store)
    {
        var order = unit.Order;
        var loot = unit.Def.IsVillager && IsRaidable(store, unit.Owner) ? LootType(unit, store.Owner.Stock) : null;
        if (loot is not { } type)
        {
            Finish(unit);
            return;
        }
        if ((unit.IsCarrying && unit.CarryType != type) || unit.CarryAmount >= Capacity - 0.001f)
        {
            unit.Order = UnitOrder.ReturnCargo(order);
            return;
        }
        var status = _game.Movement.MoveToRect(unit, store.Rect, EconomySystem.WorkReach);
        if (status == MoveStatus.Unreachable)
        {
            Finish(unit);
            return;
        }
        if (status == MoveStatus.Arrived)
        {
            Steal(unit, store, type);
        }
    }

    /// <summary>What a thief takes: more of what it already carries, else the victim's most plentiful resource.</summary>
    public static ResourceType? LootType(Unit unit, Stockpile victim)
    {
        if (unit.IsCarrying && victim[unit.CarryType] > 0)
        {
            return unit.CarryType;
        }
        ResourceType? best = null;
        var most = 0;
        foreach (var type in Resources.All)
        {
            if (victim[type] > most)
            {
                most = victim[type];
                best = type;
            }
        }
        return best;
    }

    private void Steal(Unit unit, Building store, ResourceType type)
    {
        unit.Activity = UnitActivity.Gather;
        MovementSystem.Face(unit, store.Position);
        unit.StealProgress += _game.Content.Rules.StealRate * _game.Dt;
        var whole = (int)unit.StealProgress;
        if (whole <= 0)
        {
            return;
        }
        unit.StealProgress -= whole;
        var victim = store.Owner;
        var take = Math.Min(Math.Min(whole, (int)(Capacity - unit.CarryAmount)), victim.Stock[type]);
        if (take > 0 && victim.Stock.TryTake(type, take))
        {
            unit.CarryType = type;
            unit.CarryAmount += take;
            WarnVictim(victim, store);
        }
    }

    private static void Finish(Unit unit)
    {
        unit.StealProgress = 0;
        if (unit.IsCarrying)
        {
            unit.Order = UnitOrder.ReturnCargo(UnitOrder.Idle);
            return;
        }
        OrderSystem.SetIdle(unit);
    }

    private void WarnVictim(Player victim, Building store)
    {
        if ((_game.Tick - victim.LastRaidNoticeTick) * _game.Dt < _game.Content.Rules.RaidNoticeSeconds)
        {
            return;
        }
        victim.LastRaidNoticeTick = _game.Tick;
        _game.Notify(victim, $"Your {store.Def.Name.ToLowerInvariant()} is being raided!", NoticeTone.Alert, store.Position);
    }
}
