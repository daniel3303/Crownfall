using System.Numerics;
using Crownfall.Sim.Content;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Entities;

public abstract class Entity
{
    public int Id { get; internal set; }

    /// <summary>Null for neutral entities: creeps and resource nodes.</summary>
    public Player Owner { get; internal set; }

    public Vector2 Position { get; set; }
    public float Hp { get; set; }
    public float MaxHp { get; set; }
    public bool IsRemoved { get; internal set; }

    public abstract EntityCategory Category { get; }
    public abstract int Kind { get; }
    public abstract float Radius { get; }
    public abstract int Sight { get; }
    public abstract ArmorDef Armor { get; }

    /// <summary>Tiles the entity covers; units cover the tile under their center.</summary>
    public virtual TileRect Footprint => TileRect.Single((int)MathF.Floor(Position.X), (int)MathF.Floor(Position.Y));

    public bool IsAlive => !IsRemoved && Hp > 0;

    /// <summary>Owning team, or -1 for neutral entities.</summary>
    public int Team => Owner?.Team ?? -1;

    /// <summary>Distance from a point to this entity's edge.</summary>
    public virtual float EdgeDistance(Vector2 point)
    {
        return MathF.Max(0, Vector2.Distance(point, Position) - Radius);
    }
}
