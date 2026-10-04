namespace Crownfall.Sim.Entities;

/// <summary>What a unit is visibly doing; the client picks animations from it.</summary>
public enum UnitActivity : byte
{
    Idle = 0,
    Move = 1,
    Attack = 2,
    Gather = 3,
    Build = 4,
}
