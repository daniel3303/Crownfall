namespace Crownfall.Sim.Commands;

/// <summary>Lays a line of single-tile foundations, such as a wall, from one tile to another and sends the units to build it.</summary>
public sealed class BuildLineCommand : UnitsCommand
{
    public string Building { get; set; }
    public int X1 { get; set; }
    public int Y1 { get; set; }
    public int X2 { get; set; }
    public int Y2 { get; set; }
}
