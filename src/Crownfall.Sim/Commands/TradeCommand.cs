using Crownfall.Sim.Core;

namespace Crownfall.Sim.Commands;

/// <summary>Buys or sells one market lot of a resource for gold at one of the player's market buildings.</summary>
public sealed class TradeCommand : PlayerCommand
{
    public int Building { get; set; }
    public ResourceType Resource { get; set; }
    public bool Buy { get; set; }
}
