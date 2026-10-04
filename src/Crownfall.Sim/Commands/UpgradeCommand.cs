namespace Crownfall.Sim.Commands;

/// <summary>Starts upgrading one of the player's buildings to its next level.</summary>
public sealed class UpgradeCommand : PlayerCommand
{
    public int Building { get; set; }
}
