using System.Numerics;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Systems;

/// <summary>Villager work: gathering, carrying cargo to drop sites, and constructing buildings.</summary>
public sealed class EconomySystem
{
    public const float WorkReach = 0.5f;
    private const float RetargetRadius = 8f;
    private const float FollowUpRadius = 10f;

    private readonly Game _game;

    public EconomySystem(Game game)
    {
        _game = game;
    }

    private float Capacity => _game.Content.Rules.CarryCapacity;

    public void UpdateGather(Unit unit)
    {
        if (unit.Order.Target is Building { Owner: not null } store && store.Team != unit.Team)
        {
            _game.Raids.Update(unit, store);
            return;
        }
        var order = unit.Order;
        if (!unit.Def.IsVillager || !TryResolveGatherTarget(unit, ref order))
        {
            FinishGathering(unit);
            return;
        }
        unit.Order = order;
        var (type, rect, farm) = DescribeTarget(order);
        if (unit.IsCarrying && unit.CarryType != type)
        {
            unit.CarryAmount = 0;
        }
        if (unit.CarryAmount >= Capacity - 0.001f)
        {
            unit.Order = UnitOrder.ReturnCargo(order);
            return;
        }
        var status = _game.Movement.MoveToRect(unit, rect, WorkReach);
        if (status == MoveStatus.Unreachable)
        {
            FinishGathering(unit);
            return;
        }
        if (status == MoveStatus.Moving)
        {
            return;
        }
        Harvest(unit, order, type, farm);
    }

    public void UpdateReturn(Unit unit)
    {
        if (!unit.IsCarrying)
        {
            unit.Order = unit.Order.Resume ?? UnitOrder.Idle;
            return;
        }
        var site = _game.Finder.FindDropSite(unit.Owner, unit.Position, unit.CarryType);
        if (site == null)
        {
            OrderSystem.SetIdle(unit);
            return;
        }
        var status = _game.Movement.MoveToRect(unit, site.Rect, WorkReach);
        if (status == MoveStatus.Unreachable)
        {
            OrderSystem.SetIdle(unit);
            return;
        }
        if (status == MoveStatus.Arrived)
        {
            Deposit(unit);
            unit.Order = unit.Order.Resume ?? UnitOrder.Idle;
        }
    }

    public void UpdateBuild(Unit unit)
    {
        if (unit.Order.Target is not Building foundation || !foundation.IsAlive || foundation.Team != unit.Team)
        {
            OrderSystem.SetIdle(unit);
            return;
        }
        if (foundation.IsComplete)
        {
            AfterConstruction(unit, foundation);
            return;
        }
        var status = _game.Movement.MoveToRect(unit, foundation.Rect, WorkReach);
        if (status == MoveStatus.Unreachable)
        {
            OrderSystem.SetIdle(unit);
            return;
        }
        if (status == MoveStatus.Moving)
        {
            return;
        }
        unit.Activity = UnitActivity.Build;
        MovementSystem.Face(unit, foundation.Position);
        var step = unit.Def.BuildRate * _game.Dt / foundation.Def.BuildTime;
        var before = foundation.Progress;
        foundation.Progress = MathF.Min(1, foundation.Progress + step);
        foundation.Hp = MathF.Min(foundation.MaxHp, foundation.Hp + (foundation.Progress - before) * foundation.MaxHp);
        if (foundation.Progress >= 1)
        {
            _game.CompleteBuilding(foundation);
        }
    }

    private void Harvest(Unit unit, UnitOrder order, ResourceType type, Building farm)
    {
        unit.Activity = UnitActivity.Gather;
        var (_, rect, _) = DescribeTarget(order);
        MovementSystem.Face(unit, rect.Center);
        var rate = unit.Def.GatherRate(type) * unit.Owner.Race.GatherMultiplier * (farm?.Stats.FoodRate ?? 1) * _game.Dt;
        var available = order.HasTree
            ? _game.Map.TreeWood[_game.Map.Index(order.TreeX, order.TreeY)]
            : order.Target is ResourceNode node ? node.Amount : float.MaxValue;
        var amount = MathF.Min(MathF.Min(rate, Capacity - unit.CarryAmount), available);
        unit.CarryType = type;
        unit.CarryAmount += amount;
        if (order.HasTree)
        {
            var index = _game.Map.Index(order.TreeX, order.TreeY);
            _game.Map.TreeWood[index] -= amount;
            if (_game.Map.TreeWood[index] <= 0.001f)
            {
                _game.Map.FellTree(order.TreeX, order.TreeY);
            }
        }
        else if (order.Target is ResourceNode resourceNode)
        {
            resourceNode.Amount -= amount;
            if (resourceNode.Amount <= 0.001f)
            {
                _game.RemoveNode(resourceNode);
            }
        }
    }

    private bool TryResolveGatherTarget(Unit unit, ref UnitOrder order)
    {
        if (order.HasTree)
        {
            if (_game.Map.Tile(order.TreeX, order.TreeY) == TileType.Tree)
            {
                return true;
            }
            if (!_game.Finder.TryFindNearestTree(new Vector2(order.TreeX + 0.5f, order.TreeY + 0.5f), RetargetRadius, out var x, out var y))
            {
                return false;
            }
            order = UnitOrder.GatherTree(x, y);
            return true;
        }
        if (order.Target is ResourceNode node)
        {
            if (node.IsAlive)
            {
                return true;
            }
            var next = _game.Finder.FindNearestNode(node.Position, node.Def.ResourceType, RetargetRadius);
            if (next == null)
            {
                return false;
            }
            order = UnitOrder.GatherNode(next);
            return true;
        }
        if (order.Target is Building farm)
        {
            if (_game.Finder.IsFarmAvailable(farm, unit))
            {
                farm.FarmWorker = unit;
                return true;
            }
            var other = _game.Finder.FindFreeFarm(unit);
            if (other == null)
            {
                return false;
            }
            other.FarmWorker = unit;
            order = UnitOrder.GatherNode(other);
            return true;
        }
        return false;
    }

    private static (ResourceType Type, TileRect Rect, Building Farm) DescribeTarget(UnitOrder order)
    {
        if (order.HasTree)
        {
            return (ResourceType.Wood, TileRect.Single(order.TreeX, order.TreeY), null);
        }
        if (order.Target is ResourceNode node)
        {
            return (node.Def.ResourceType, node.Rect, null);
        }
        var farm = (Building)order.Target;
        return (ResourceType.Food, farm.Rect, farm);
    }

    private void FinishGathering(Unit unit)
    {
        if (unit.IsCarrying)
        {
            unit.Order = UnitOrder.ReturnCargo(UnitOrder.Idle);
            return;
        }
        OrderSystem.SetIdle(unit);
    }

    private void Deposit(Unit unit)
    {
        var amount = (int)MathF.Round(unit.CarryAmount);
        var owner = unit.Owner;
        _game.Storage.Store(owner, unit.CarryType, amount);
        owner.Stats.Gathered += amount;
        _game.Events.Add(new DepositEvent
        {
            Player = owner.Index,
            X = unit.Position.X,
            Y = unit.Position.Y,
            Resource = unit.CarryType,
            Amount = amount,
        });
        unit.CarryAmount = 0;
    }

    /// <summary>The closest unfinished own building in reach, so builders walk a wall line in order.</summary>
    private Building NearestFoundation(Unit unit)
    {
        Building best = null;
        var bestDistance = FollowUpRadius * FollowUpRadius;
        foreach (var building in _game.Entities.Buildings)
        {
            if (!building.IsAlive || building.IsComplete || building.Owner != unit.Owner)
            {
                continue;
            }
            var distance = Vector2.DistanceSquared(building.Position, unit.Position);
            if (distance <= bestDistance)
            {
                bestDistance = distance;
                best = building;
            }
        }
        return best;
    }

    private void AfterConstruction(Unit unit, Building building)
    {
        if (building.Def.IsFarm && _game.Finder.IsFarmAvailable(building, unit))
        {
            building.FarmWorker = unit;
            unit.Order = UnitOrder.GatherNode(building);
            return;
        }
        var next = NearestFoundation(unit);
        if (next != null)
        {
            unit.Order = UnitOrder.Build(next);
            return;
        }
        if (building.Def.IsDropOff && _game.Finder.TryFindNearestTree(building.Position, RetargetRadius, out var x, out var y))
        {
            unit.Order = UnitOrder.GatherTree(x, y);
            return;
        }
        OrderSystem.SetIdle(unit);
    }

}
