namespace Crownfall.Sim.Commands;

/// <summary>Stops a running upgrade and refunds its full price.</summary>
public sealed class CancelUpgradeCommand : PlayerCommand
{
    public int Building { get; set; }
}
