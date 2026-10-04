using System.Numerics;
using Crownfall.Sim.Content;

namespace Crownfall.Sim.Entities;

/// <summary>A neutral camp that respawns its creeps a while after they all die.</summary>
public sealed class CreepCamp
{
    public CreepCamp(int id, Vector2 center, IReadOnlyList<UnitDef> members)
    {
        Id = id;
        Center = center;
        Members = members;
    }

    public int Id { get; }
    public Vector2 Center { get; }
    public IReadOnlyList<UnitDef> Members { get; }
    public List<Unit> Alive { get; } = [];
    public int RespawnTick { get; set; } = -1;

    /// <summary>Seconds after its last creep dies before the camp fills again.</summary>
    public float RespawnSeconds { get; init; }

    /// <summary>How far from the center its creeps chase before they walk back and heal.</summary>
    public float LeashRange { get; init; }

    /// <summary>The dragon's lair: it lands on schedule even with players standing there, and its landing is announced.</summary>
    public bool IsLair { get; init; }
}
