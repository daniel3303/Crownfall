using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Bots;

/// <summary>Where a bot's villagers can gather this think, chosen from explored tiles and known deposits only.</summary>
public sealed class BotSites
{
    public const float NearBaseRadius = 14f;
    private const float WideSearchRadius = 34f;
    private const float EnemyBaseClearance = 20f;
    private const int WoodCandidates = 6;
    private const float FoodPerBerryWorker = 60f;
    private const int WorkersPerBush = 2;

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotMemory _memory;
    private readonly ResourceNode[] _nodes = new ResourceNode[Resources.Count];
    private readonly List<(int X, int Y)> _trees = [];

    // Deposit amounts as last seen; a deposit in fog keeps the amount the team last saw there.
    private readonly Dictionary<int, float> _seenAmounts = [];
    private int _nextTree;

    public BotSites(Game game, Player player, BotMemory memory)
    {
        _game = game;
        _player = player;
        _memory = memory;
    }

    /// <summary>Whether the bot knows somewhere to gather each resource; food is always available through farms.</summary>
    public bool[] Available { get; } = new bool[Resources.Count];

    /// <summary>Food workers the remaining berries near home can keep busy for about a minute.</summary>
    public int BerryWorkers { get; private set; }

    public bool HasBerries => _nodes[(int)ResourceType.Food] != null;

    public void Refresh(BotView view)
    {
        var home = view.Home;
        RefreshBerries(home);
        _nodes[(int)ResourceType.Gold] = ChooseNode(home, ResourceType.Gold);
        _nodes[(int)ResourceType.Stone] = ChooseNode(home, ResourceType.Stone);
        RefreshTrees(view);
        Available[(int)ResourceType.Food] = true;
        Available[(int)ResourceType.Wood] = _trees.Count > 0;
        Available[(int)ResourceType.Gold] = _nodes[(int)ResourceType.Gold] != null;
        Available[(int)ResourceType.Stone] = _nodes[(int)ResourceType.Stone] != null;
    }

    public GatherCommand CommandFor(Unit villager, ResourceType type)
    {
        var units = new List<int> { villager.Id };
        switch (type)
        {
            case ResourceType.Food:
                var berries = _nodes[(int)ResourceType.Food];
                if (berries != null)
                {
                    return new GatherCommand { Units = units, Target = berries.Id };
                }
                var farm = _game.Finder.FindFreeFarm(villager);
                return farm == null ? null : new GatherCommand { Units = units, Target = farm.Id };
            case ResourceType.Wood:
                if (_trees.Count == 0)
                {
                    return null;
                }
                var (x, y) = _trees[_nextTree++ % _trees.Count];
                return new GatherCommand { Units = units, TileX = x, TileY = y };
            default:
                var node = _nodes[(int)type];
                return node == null ? null : new GatherCommand { Units = units, Target = node.Id };
        }
    }

    /// <summary>A work spot worth a storehouse: a deposit or tree line busy with villagers but far from any drop site.</summary>
    public bool TryDistantSite(BotView view, float nodeDistance, float woodDistance, int minWorkers, out Vector2 site)
    {
        foreach (var type in Resources.All)
        {
            var node = _nodes[(int)type];
            if (type == ResourceType.Food || node == null || WorkersOn(view, node) < minWorkers)
            {
                continue;
            }
            var drop = _game.Finder.FindDropSite(_player, node.Position, type);
            if (drop == null || drop.Rect.DistanceTo(node.Position) - node.Radius > nodeDistance)
            {
                site = node.Position;
                return true;
            }
        }
        foreach (var villager in view.Villagers)
        {
            var order = BotJobs.GatherOrder(villager);
            if (order is not { HasTree: true })
            {
                continue;
            }
            var tree = new Vector2(order.TreeX + 0.5f, order.TreeY + 0.5f);
            var drop = _game.Finder.FindDropSite(_player, tree, ResourceType.Wood);
            if (drop == null || drop.Rect.DistanceTo(tree) > woodDistance)
            {
                site = tree;
                return true;
            }
        }
        site = default;
        return false;
    }

    private void RefreshBerries(Vector2 home)
    {
        ResourceNode nearest = null;
        var bushes = 0;
        var amount = 0f;
        var best = float.MaxValue;
        foreach (var node in _game.Entities.Nodes)
        {
            if (!IsKnown(node, ResourceType.Food) || node.Rect.DistanceTo(home) > NearBaseRadius)
            {
                continue;
            }
            bushes++;
            amount += SeenAmount(node);
            var distance = node.Rect.DistanceTo(home);
            if (distance < best)
            {
                best = distance;
                nearest = node;
            }
        }
        _nodes[(int)ResourceType.Food] = nearest;
        BerryWorkers = Math.Min(bushes * WorkersPerBush, (int)(amount / FoodPerBerryWorker));
    }

    /// <summary>The nearest known deposit near home, else the nearest known one away from enemy bases.</summary>
    private ResourceNode ChooseNode(Vector2 home, ResourceType type)
    {
        ResourceNode near = null;
        ResourceNode far = null;
        var nearDistance = float.MaxValue;
        var farDistance = float.MaxValue;
        foreach (var node in _game.Entities.Nodes)
        {
            if (!IsKnown(node, type))
            {
                continue;
            }
            var distance = node.Rect.DistanceTo(home);
            if (distance <= WideSearchRadius && distance < nearDistance)
            {
                nearDistance = distance;
                near = node;
            }
            else if (distance > WideSearchRadius && distance < farDistance && !NearEnemyBase(node.Position))
            {
                farDistance = distance;
                far = node;
            }
        }
        return near ?? far;
    }

    private bool IsKnown(ResourceNode node, ResourceType type)
    {
        return node.Def.ResourceType == type && _game.Vision.IsRectExplored(_player.Team, node.Rect);
    }

    private float SeenAmount(ResourceNode node)
    {
        if (_game.Vision.IsPointVisible(_player.Team, node.Position))
        {
            _seenAmounts[node.Id] = node.Amount;
        }
        return _seenAmounts.TryGetValue(node.Id, out var amount) ? amount : node.Def.Amount;
    }

    private bool NearEnemyBase(Vector2 point)
    {
        return _memory.Buildings.Any(b => Vector2.Distance(b.Position, point) < EnemyBaseClearance);
    }

    private static int WorkersOn(BotView view, ResourceNode node)
    {
        return view.Villagers.Count(v => BotJobs.GatherOrder(v)?.Target == node);
    }

    /// <summary>Collects the nearest explored, reachable trees around whichever drop site has wood closest.</summary>
    private void RefreshTrees(BotView view)
    {
        _trees.Clear();
        var bestDistance = float.MaxValue;
        var origin = view.Home;
        foreach (var building in view.Buildings)
        {
            if (building.IsComplete && building.Def.IsDropOff && TryNearestTree(building.Position, out _, out var distance) && distance < bestDistance)
            {
                bestDistance = distance;
                origin = building.Position;
            }
        }
        CollectTrees(origin);
    }

    private bool TryNearestTree(Vector2 origin, out (int X, int Y) tree, out float distance)
    {
        tree = default;
        distance = float.MaxValue;
        var reach = (int)WideSearchRadius;
        for (var ring = 0; ring <= reach && ring * ring <= distance; ring++)
        {
            foreach (var (x, y) in Ring(origin, ring))
            {
                var squared = Vector2.DistanceSquared(origin, new Vector2(x + 0.5f, y + 0.5f));
                if (squared < distance && IsUsableTree(x, y))
                {
                    distance = squared;
                    tree = (x, y);
                }
            }
        }
        return distance < float.MaxValue;
    }

    private void CollectTrees(Vector2 origin)
    {
        var reach = (int)WideSearchRadius;
        for (var ring = 0; ring <= reach && _trees.Count < WoodCandidates; ring++)
        {
            foreach (var tile in Ring(origin, ring))
            {
                if (_trees.Count < WoodCandidates && IsUsableTree(tile.X, tile.Y))
                {
                    _trees.Add(tile);
                }
            }
        }
    }

    private bool IsUsableTree(int x, int y)
    {
        var map = _game.Map;
        if (!map.InBounds(x, y) || map.Tile(x, y) != TileType.Tree || !_game.Vision.IsTileExplored(_player.Team, x, y))
        {
            return false;
        }
        return map.IsWalkable(x + 1, y) || map.IsWalkable(x - 1, y) || map.IsWalkable(x, y + 1) || map.IsWalkable(x, y - 1);
    }

    private static IEnumerable<(int X, int Y)> Ring(Vector2 origin, int ring)
    {
        var centerX = (int)MathF.Floor(origin.X);
        var centerY = (int)MathF.Floor(origin.Y);
        if (ring == 0)
        {
            yield return (centerX, centerY);
            yield break;
        }
        for (var d = -ring; d < ring; d++)
        {
            yield return (centerX + d, centerY - ring);
            yield return (centerX + ring, centerY + d);
            yield return (centerX - d, centerY + ring);
            yield return (centerX - ring, centerY - d);
        }
    }
}
