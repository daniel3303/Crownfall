namespace Crownfall.Sim.Commands;

/// <summary>Picks the talent with this id from the hero's talent tier, from 0, once the hero's level has opened it.</summary>
public sealed class PickTalentCommand : PlayerCommand
{
    public int Tier { get; set; }
    public string Talent { get; set; }
}
