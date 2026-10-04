namespace Crownfall.Sim.Commands;

public sealed class TrainCommand : PlayerCommand
{
    public int Building { get; set; }
    public string Unit { get; set; }
}
