namespace Crownfall.Sim.Commands;

/// <summary>A command addressed to a set of the player's units.</summary>
public abstract class UnitsCommand : PlayerCommand
{
    public const int MaxUnits = 200;

    public List<int> Units { get; set; } = [];
}
