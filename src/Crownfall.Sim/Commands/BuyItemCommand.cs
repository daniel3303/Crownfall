namespace Crownfall.Sim.Commands;

/// <summary>Buys the item with this content id into the hero's first free slot.</summary>
public sealed class BuyItemCommand : PlayerCommand
{
    public string Item { get; set; }
}
