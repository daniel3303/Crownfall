namespace Crownfall.Sim.Commands;

/// <summary>Sells the item in this inventory slot, from 0, for part of its price.</summary>
public sealed class SellItemCommand : PlayerCommand
{
    public int Slot { get; set; }
}
