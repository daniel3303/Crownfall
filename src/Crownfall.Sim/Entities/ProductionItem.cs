using Crownfall.Sim.Content;

namespace Crownfall.Sim.Entities;

public sealed class ProductionItem
{
    public ProductionItem(UnitDef unit, int[] paidCost)
    {
        Unit = unit;
        PaidCost = paidCost;
    }

    public UnitDef Unit { get; }
    public int[] PaidCost { get; }
    public float Progress { get; set; }
}
