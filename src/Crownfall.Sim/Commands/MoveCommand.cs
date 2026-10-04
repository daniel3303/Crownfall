namespace Crownfall.Sim.Commands;

public sealed class MoveCommand : UnitsCommand
{
    public float X { get; set; }
    public float Y { get; set; }

    /// <summary>When true, units fight anything they meet on the way.</summary>
    public bool AttackMove { get; set; }
}
