using Crownfall.Sim.Core;

namespace Crownfall.Sim.Commands;

/// <summary>Sends resources to a teammate when the lobby allows tribute.</summary>
public sealed class TributeCommand : PlayerCommand
{
    public int To { get; set; }
    public ResourceType Resource { get; set; }
    public int Amount { get; set; }
}
