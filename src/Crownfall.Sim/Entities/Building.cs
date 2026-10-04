using System.Numerics;
using Crownfall.Sim.Content;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Entities;

public sealed class Building : Entity
{
    public const int MaxQueue = 5;

    public Building(BuildingDef def, TileRect rect)
    {
        Def = def;
        Rect = rect;
        Position = rect.Center;
    }

    public BuildingDef Def { get; }
    public TileRect Rect { get; }
    public bool IsComplete { get; set; }

    /// <summary>Construction progress from 0 to 1.</summary>
    public float Progress { get; set; }

    public List<ProductionItem> Queue { get; } = [];
    public bool HasRally { get; set; }
    public Vector2 Rally { get; set; }
    public float AttackCooldown { get; set; }

    /// <summary>The single villager allowed to work a farm.</summary>
    public Unit FarmWorker { get; set; }

    /// <summary>Upgrade level, from 1.</summary>
    public int Level { get; set; } = 1;

    public BuildingStats Stats => Def.StatsAt(Level);

    /// <summary>Stats of the level an upgrade leads to, or null at the top level.</summary>
    public BuildingStats NextStats => Level < Def.MaxLevel ? Def.StatsAt(Level + 1) : null;

    public bool IsUpgrading { get; set; }

    /// <summary>Upgrade progress from 0 to 1 while <see cref="IsUpgrading"/>.</summary>
    public float UpgradeProgress { get; set; }

    /// <summary>What the running upgrade cost, refunded in full when it is cancelled.</summary>
    public int[] UpgradePaid { get; set; }

    public override EntityCategory Category => EntityCategory.Building;
    public override int Kind => Def.Kind;
    public override float Radius => Def.Size / 2f;
    public override int Sight => Stats.Sight;
    public override ArmorDef Armor => Stats.Armor;
    public override TileRect Footprint => Rect;

    public override float EdgeDistance(Vector2 point)
    {
        return Rect.DistanceTo(point);
    }
}
