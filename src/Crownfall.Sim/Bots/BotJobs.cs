using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>Reads which resource a villager is working, looking through a cargo trip to the gather order it resumes.</summary>
public static class BotJobs
{
    public static UnitOrder GatherOrder(Unit villager)
    {
        var order = villager.Order.Type == OrderType.ReturnCargo ? villager.Order.Resume : villager.Order;
        return order is { Type: OrderType.Gather } ? order : null;
    }

    public static ResourceType? JobOf(Unit villager)
    {
        var order = GatherOrder(villager);
        if (order == null)
        {
            return null;
        }
        if (order.HasTree)
        {
            return ResourceType.Wood;
        }
        if (order.Target is Building { Owner: not null } building && building.Owner != villager.Owner)
        {
            // A thief at an enemy drop-off works no resource of its own.
            return null;
        }
        return order.Target is ResourceNode node ? node.Def.ResourceType : ResourceType.Food;
    }
}
