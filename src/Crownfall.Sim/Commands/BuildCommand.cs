namespace Crownfall.Sim.Commands;

/// <summary>Place a new foundation with its top-left tile at X/Y and send the units to build it.</summary>
public sealed class BuildCommand : UnitsCommand
{
    public string Building { get; set; }
    public int X { get; set; }
    public int Y { get; set; }
}
