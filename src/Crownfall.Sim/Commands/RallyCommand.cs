namespace Crownfall.Sim.Commands;

public sealed class RallyCommand : PlayerCommand
{
    public int Building { get; set; }
    public float X { get; set; }
    public float Y { get; set; }
}
