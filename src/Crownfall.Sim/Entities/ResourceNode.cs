using System.Numerics;
using Crownfall.Sim.Content;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Entities;

/// <summary>A gatherable deposit. Hp mirrors the remaining amount so snapshots can carry it.</summary>
public sealed class ResourceNode : Entity
{
    private static readonly ArmorDef NoArmor = new();

    public ResourceNode(NodeDef def, TileRect rect)
    {
        Def = def;
        Rect = rect;
        Position = rect.Center;
        Hp = def.Amount;
        MaxHp = def.Amount;
    }

    public NodeDef Def { get; }
    public TileRect Rect { get; }

    public float Amount
    {
        get => Hp;
        set => Hp = value;
    }

    public override EntityCategory Category => EntityCategory.Node;
    public override int Kind => Def.Kind;
    public override float Radius => Def.Size / 2f;
    public override int Sight => 0;
    public override ArmorDef Armor => NoArmor;
    public override TileRect Footprint => Rect;

    public override float EdgeDistance(Vector2 point)
    {
        return Rect.DistanceTo(point);
    }
}
