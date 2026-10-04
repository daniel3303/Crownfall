using System.Numerics;

namespace Crownfall.Sim.Entities;

/// <summary>An immutable unit order. <see cref="Resume"/> is the order to return to when this one ends.</summary>
public sealed class UnitOrder
{
    public static readonly UnitOrder Idle = new() { Type = OrderType.Idle };

    public OrderType Type { get; private init; }
    public Vector2 Point { get; private init; }
    public Entity Target { get; private init; }
    public bool HasTree { get; private init; }
    public int TreeX { get; private init; }
    public int TreeY { get; private init; }

    /// <summary>True when the unit picked this target itself rather than being told to.</summary>
    public bool IsAuto { get; private init; }

    public UnitOrder Resume { get; private init; }

    public static UnitOrder Move(Vector2 point)
    {
        return new UnitOrder { Type = OrderType.Move, Point = point };
    }

    public static UnitOrder AttackMove(Vector2 point)
    {
        return new UnitOrder { Type = OrderType.AttackMove, Point = point };
    }

    public static UnitOrder Attack(Entity target, bool isAuto = false, UnitOrder resume = null)
    {
        return new UnitOrder { Type = OrderType.Attack, Target = target, IsAuto = isAuto, Resume = resume };
    }

    public static UnitOrder GatherNode(Entity node)
    {
        return new UnitOrder { Type = OrderType.Gather, Target = node };
    }

    public static UnitOrder GatherTree(int x, int y)
    {
        return new UnitOrder { Type = OrderType.Gather, HasTree = true, TreeX = x, TreeY = y };
    }

    public static UnitOrder ReturnCargo(UnitOrder resume)
    {
        return new UnitOrder { Type = OrderType.ReturnCargo, Resume = resume };
    }

    public static UnitOrder Build(Building foundation)
    {
        return new UnitOrder { Type = OrderType.Build, Target = foundation };
    }
}
