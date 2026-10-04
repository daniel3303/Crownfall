namespace Crownfall.Sim.Commands;

/// <summary>Send units to help finish an existing foundation.</summary>
public sealed class ConstructCommand : UnitsCommand
{
    public int Target { get; set; }
}
