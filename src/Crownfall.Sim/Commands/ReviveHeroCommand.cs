namespace Crownfall.Sim.Commands;

/// <summary>Pays to bring a fallen hero back at a town center; Building 0 lets the simulation pick one.</summary>
public sealed class ReviveHeroCommand : PlayerCommand
{
    public int Building { get; set; }
}
