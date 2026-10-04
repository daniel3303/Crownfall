using System.Numerics;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Systems;

/// <summary>Runs each unit's current order: idle aggro, moving, attack-moving and attacking.</summary>
public sealed class OrderSystem
{
    public const float RangeTolerance = 0.2f;
    private const float ArriveDistance = 0.15f;
    private const float AutoChaseFactor = 1.6f;

    private readonly Game _game;

    public OrderSystem(Game game)
    {
        _game = game;
    }

    public void Update(Unit unit)
    {
        if (!unit.IsAlive)
        {
            return;
        }
        unit.AttackCooldown = MathF.Max(0, unit.AttackCooldown - _game.Dt);
        if (unit.Dash != null)
        {
            return;
        }
        if (unit.IsStunned(_game.Tick))
        {
            unit.Activity = UnitActivity.Idle;
            return;
        }
        switch (unit.Order.Type)
        {
            case OrderType.Idle:
                UpdateIdle(unit);
                break;
            case OrderType.Move:
                UpdateMove(unit);
                break;
            case OrderType.AttackMove:
                UpdateAttackMove(unit);
                break;
            case OrderType.Attack:
                UpdateAttack(unit);
                break;
            case OrderType.Gather:
                _game.Economy.UpdateGather(unit);
                break;
            case OrderType.ReturnCargo:
                _game.Economy.UpdateReturn(unit);
                break;
            case OrderType.Build:
                _game.Economy.UpdateBuild(unit);
                break;
        }
    }

    public static void SetIdle(Unit unit)
    {
        unit.Order = UnitOrder.Idle;
        unit.Activity = UnitActivity.Idle;
        unit.ClearPath();
    }

    private void UpdateIdle(Unit unit)
    {
        unit.Activity = UnitActivity.Idle;
        if (unit.Def.IsCreep)
        {
            _game.Creeps.UpdateIdle(unit);
            return;
        }
        if (unit.Def.IsVillager)
        {
            return;
        }
        var target = _game.Combat.FindTarget(unit, unit.AcquireRange, includeBuildings: false);
        if (target != null)
        {
            unit.Order = UnitOrder.Attack(target, isAuto: true, resume: UnitOrder.Idle);
        }
    }

    private void UpdateMove(Unit unit)
    {
        var status = _game.Movement.MoveTo(unit, unit.Order.Point, ArriveDistance);
        if (status != MoveStatus.Moving)
        {
            SetIdle(unit);
        }
    }

    private void UpdateAttackMove(Unit unit)
    {
        var target = _game.Combat.FindTarget(unit, unit.AcquireRange, includeBuildings: true);
        if (target != null)
        {
            unit.Order = UnitOrder.Attack(target, isAuto: true, resume: unit.Order);
            UpdateAttack(unit);
            return;
        }
        var status = _game.Movement.MoveTo(unit, unit.Order.Point, ArriveDistance, CanBreach(unit));
        if (TryBreach(unit, status))
        {
            return;
        }
        if (status != MoveStatus.Moving)
        {
            SetIdle(unit);
        }
    }

    /// <summary>Owned soldiers and heroes break through enemy walls; villagers and creeps stop at them.</summary>
    private static bool CanBreach(Unit unit)
    {
        return unit.Owner != null && (unit.Def.IsMilitary || unit.IsHero);
    }

    /// <summary>On a path blocked by an enemy wall, attacks the wall and picks the current order up again once it falls.</summary>
    private bool TryBreach(Unit unit, MoveStatus status)
    {
        if (status != MoveStatus.Blocked || _game.Entities.Get(unit.BreachWall) is not Building { IsAlive: true } wall)
        {
            return false;
        }
        unit.Order = UnitOrder.Attack(wall, isAuto: true, resume: unit.Order);
        unit.ClearPath();
        return true;
    }

    private void UpdateAttack(Unit unit)
    {
        var order = unit.Order;
        var target = order.Target;
        if (!_game.Combat.CanAttack(unit, target))
        {
            unit.Order = order.Resume ?? UnitOrder.Idle;
            unit.Activity = UnitActivity.Idle;
            unit.ClearPath();
            return;
        }
        if (unit.Camp != null && Vector2.Distance(unit.Position, unit.Camp.Center) > unit.Camp.LeashRange)
        {
            _game.Creeps.Leash(unit);
            return;
        }
        var distance = target.EdgeDistance(unit.Position) - unit.Radius;
        if (order.IsAuto && unit.Camp == null && distance > unit.AcquireRange * AutoChaseFactor)
        {
            unit.Order = order.Resume ?? UnitOrder.Idle;
            return;
        }
        var reach = unit.Def.Range + RangeTolerance;
        if (distance <= reach)
        {
            unit.ClearPath();
            MovementSystem.Face(unit, target.Position);
            unit.Activity = UnitActivity.Attack;
            if (unit.AttackCooldown <= 0)
            {
                _game.Combat.Attack(unit, target);
                unit.AttackCooldown = unit.CooldownAt(_game.Tick);
            }
            return;
        }
        var status = _game.Movement.MoveToEntity(unit, target, reach, CanBreach(unit));
        if (TryBreach(unit, status))
        {
            return;
        }
        if (status == MoveStatus.Unreachable)
        {
            unit.Order = order.Resume ?? UnitOrder.Idle;
        }
    }
}
