namespace Crownfall.Sim.Commands;

/// <summary>Cancels the last queued item and refunds it.</summary>
public sealed class CancelTrainCommand : PlayerCommand
{
    public int Building { get; set; }
}
