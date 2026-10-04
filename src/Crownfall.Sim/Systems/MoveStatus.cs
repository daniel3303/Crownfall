namespace Crownfall.Sim.Systems;

public enum MoveStatus
{
    Moving,
    Arrived,
    Unreachable,

    /// <summary>The path ends at an enemy wall (<see cref="Entities.Unit.BreachWall"/>) that must be broken first.</summary>
    Blocked,
}
