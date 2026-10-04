using System.Numerics;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Systems;

/// <summary>Nearest-target lookups for villagers and bots: drop sites, trees, deposits and free farms.</summary>
public sealed class ResourceFinder
{
    private readonly Game _game;

    public ResourceFinder(Game game)
    {
        _game = game;
    }

    public Building FindDropSite(Player owner, Vector2 near, ResourceType type)
    {
        var shared = _game.Config.Sharing == ResourceSharing.Shared;
        Building best = null;
        var bestDistance = float.MaxValue;
        foreach (var building in _game.Entities.Buildings)
        {
            var usable = building.Owner == owner || shared && building.Team == owner.Team;
            if (!usable || !building.IsAlive || !building.IsComplete || !building.Def.IsDropOff || !building.Def.Accepts(type))
            {
                continue;
            }
            var distance = building.Rect.DistanceTo(near);
            if (distance < bestDistance)
            {
                bestDistance = distance;
                best = building;
            }
        }
        return best;
    }

    public bool TryFindNearestTree(Vector2 near, float radius, out int treeX, out int treeY)
    {
        var map = _game.Map;
        var reach = (int)MathF.Ceiling(radius);
        var centerX = (int)MathF.Floor(near.X);
        var centerY = (int)MathF.Floor(near.Y);
        var bestDistance = float.MaxValue;
        treeX = treeY = 0;
        for (var y = centerY - reach; y <= centerY + reach; y++)
        {
            for (var x = centerX - reach; x <= centerX + reach; x++)
            {
                if (map.Tile(x, y) != TileType.Tree || !map.InBounds(x, y) || !HasWalkableNeighbor(x, y))
                {
                    continue;
                }
                var distance = Vector2.DistanceSquared(near, new Vector2(x + 0.5f, y + 0.5f));
                if (distance < bestDistance && distance <= radius * radius)
                {
                    bestDistance = distance;
                    treeX = x;
                    treeY = y;
                }
            }
        }
        return bestDistance < float.MaxValue;
    }

    public ResourceNode FindNearestNode(Vector2 near, ResourceType type, float radius)
    {
        ResourceNode best = null;
        var bestDistance = radius;
        foreach (var node in _game.Entities.Nodes)
        {
            if (!node.IsAlive || node.Def.ResourceType != type)
            {
                continue;
            }
            var distance = node.Rect.DistanceTo(near);
            if (distance <= bestDistance)
            {
                bestDistance = distance;
                best = node;
            }
        }
        return best;
    }

    public Building FindFreeFarm(Unit unit)
    {
        Building best = null;
        var bestDistance = float.MaxValue;
        foreach (var building in _game.Entities.Buildings)
        {
            if (!IsFarmAvailable(building, unit))
            {
                continue;
            }
            var distance = Vector2.Distance(building.Position, unit.Position);
            if (distance < bestDistance)
            {
                bestDistance = distance;
                best = building;
            }
        }
        return best;
    }

    public bool IsFarmAvailable(Building farm, Unit unit)
    {
        if (!farm.IsAlive || !farm.IsComplete || !farm.Def.IsFarm || farm.Owner != unit.Owner)
        {
            return false;
        }
        var worker = farm.FarmWorker;
        return worker == null || worker == unit || !worker.IsAlive || !ReferenceEquals(CurrentGatherTarget(worker), farm);
    }

    private bool HasWalkableNeighbor(int x, int y)
    {
        var map = _game.Map;
        return map.IsWalkable(x + 1, y) || map.IsWalkable(x - 1, y) || map.IsWalkable(x, y + 1) || map.IsWalkable(x, y - 1);
    }

    private static Entity CurrentGatherTarget(Unit unit)
    {
        var order = unit.Order;
        if (order.Type == OrderType.ReturnCargo)
        {
            order = order.Resume;
        }
        return order is { Type: OrderType.Gather } ? order.Target : null;
    }
}
