namespace Crownfall.Sim.Commands;

/// <summary>Spends one of the hero's banked level-up points on the stat with this content id.</summary>
public sealed class HeroStatCommand : PlayerCommand
{
    public string Stat { get; set; }
}
