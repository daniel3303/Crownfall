using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>
/// Decides what a bot builds and where: a lost town center, houses ahead of population, barracks, farms, storehouses
/// beside distant work and towers. Unaffordable wishes become <see cref="PendingCost"/> so villagers gather for them.
/// </summary>
public sealed class BotBuilder
{
    // Total bank above which a bot adds production or defenses instead of letting resources pile up.
    public const int FloatingBank = 700;

    private const int BaseHousingHeadroom = 2;
    private const int HeadroomPerProducer = 3;
    private const float NodeDropDistance = 6f;
    private const float WoodDropDistance = 9f;
    private const int MinStorehouseWorkers = 2;

    // When a crowded base has no spot near the preferred point, the search widens around home by this many rings.
    private const int FallbackRings = 10;

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotProfile _profile;
    private readonly BotMemory _memory;
    private int[] _heroReserve = new int[Resources.Count];

    public BotBuilder(Game game, Player player, BotProfile profile, BotMemory memory)
    {
        _game = game;
        _player = player;
        _profile = profile;
        _memory = memory;
    }

    public int[] PendingCost { get; } = new int[Resources.Count];

    /// <summary>True while a house is needed and wood for it must not be spent elsewhere.</summary>
    public bool HousingTight { get; private set; }

    /// <summary>One building pass; nothing but a lost town center, which a revive needs, spends <paramref name="heroReserve"/>.</summary>
    public void Run(BotView view, BotSites sites, int foodWorkers, bool urgent, int[] heroReserve)
    {
        Array.Clear(PendingCost);
        _heroReserve = heroReserve;
        if (view.Villagers.Count == 0)
        {
            return;
        }
        EnsureTownCenter(view);
        EnsureHouses(view);
        EnsureBarracks(view);
        EnsureFarms(view, sites, foodWorkers, urgent ? 1 : _profile.ConcurrentFarms);
        EnsureStorehouse(view, sites);
        EnsureTowers(view);
        StaffFoundations(view);
    }

    private bool Floating => Resources.Total(_player.Stock.Snapshot()) > FloatingBank;

    private void EnsureTownCenter(BotView view)
    {
        if (view.Count("townCenter") > 0)
        {
            return;
        }
        var start = _player.Start.TownCenter;
        var def = _game.Content.Building("townCenter");
        if (!Want(def, new int[Resources.Count]))
        {
            return;
        }
        if (_game.Map.IsBuildable(start) && _game.Vision.IsRectExplored(_player.Team, start))
        {
            Issue(new BuildCommand { Units = Builders(view, start.Center, 3), Building = def.Id, X = start.X, Y = start.Y });
            return;
        }
        TryBuild(view, def, view.Home, 2, 10, 3);
    }

    private void EnsureHouses(BotView view)
    {
        var limit = _game.Content.Rules.PopulationLimit;
        var house = _game.Content.Building("house");
        var producers = (view.TownCenter != null ? 1 : 0) + view.Count("barracks", includeUnfinished: false);
        var headroom = BaseHousingHeadroom + HeadroomPerProducer * producers;
        var building = view.Constructing("house");
        var room = _player.PopulationCap + building * house.Pop - _player.Population;
        HousingTight = _player.PopulationCap < limit && room <= headroom;
        if (!HousingTight || building >= _profile.ConcurrentHouses || !Want(house))
        {
            return;
        }
        TryBuild(view, house, Toward(view.Home, AwayFromCenter(view.Home), 6), 2, 9, 1);
    }

    private void EnsureBarracks(BotView view)
    {
        var villagers = view.Villagers.Count;
        if (villagers < _profile.BarracksAtVillagers || view.IsConstructing("barracks"))
        {
            return;
        }
        var extra = (villagers - _profile.BarracksAtVillagers) / _profile.VillagersPerExtraBarracks;
        var wanted = Math.Min(_profile.MaxBarracks, 1 + extra + (Floating && ProductionSaturated(view) ? 1 : 0));
        var barracks = _game.Content.Building("barracks");
        if (view.Count("barracks") < wanted && Want(barracks))
        {
            TryBuild(view, barracks, Toward(view.Home, _game.MapCenter, 7), 2, 10, 2);
        }
    }

    private void EnsureFarms(BotView view, BotSites sites, int foodWorkers, int concurrent)
    {
        var farm = _game.Content.Building("farm");
        var farms = view.Count("farm");
        var needed = foodWorkers - sites.BerryWorkers;
        if (view.TownCenter == null || farms >= needed || farms >= _profile.MaxFarms || view.Constructing("farm") >= concurrent || !Want(farm))
        {
            return;
        }
        TryBuild(view, farm, view.Home, 3, 11, 1);
    }

    private void EnsureStorehouse(BotView view, BotSites sites)
    {
        var storehouse = _game.Content.Building("storehouse");
        if (view.Count("storehouse") >= _profile.MaxStorehouses || view.IsConstructing("storehouse") || view.Villagers.Count < 6)
        {
            return;
        }
        if (!sites.TryDistantSite(view, NodeDropDistance, WoodDropDistance, MinStorehouseWorkers, out var site) || !Want(storehouse))
        {
            return;
        }
        TryBuild(view, storehouse, site, 2, 5, 1);
    }

    private void EnsureTowers(BotView view)
    {
        var towers = view.Count("tower");
        var wanted = Floating && _player.Stock[ResourceType.Stone] >= 100 ? _profile.MaxTowers : _profile.Towers;
        if (view.Count("barracks", includeUnfinished: false) == 0 || towers >= wanted || view.IsConstructing("tower"))
        {
            return;
        }
        var tower = _game.Content.Building("tower");
        if (!Want(tower))
        {
            return;
        }
        var threat = _memory.CandidateStarts.Count > 0 ? _memory.CandidateStarts[0] : _game.MapCenter;
        var side = towers % 2 == 0 ? 0.7f : -0.7f;
        TryBuild(view, tower, Toward(view.Home, Rotate(view.Home, threat, side), 7), 1, 6, 1);
    }

    /// <summary>True when every finished barracks already has a full queue, so only another barracks can spend more.</summary>
    private bool ProductionSaturated(BotView view)
    {
        return view.Buildings
            .Where(b => b.IsComplete && b.Def.TrainableUnits.Any(u => u.IsMilitary))
            .All(b => b.Queue.Count >= _profile.BarracksQueue);
    }

    /// <summary>Sends a villager to any foundation nobody is working on.</summary>
    private void StaffFoundations(BotView view)
    {
        foreach (var foundation in view.Buildings)
        {
            if (foundation.IsComplete || view.Villagers.Any(v => v.Order.Type == OrderType.Build && v.Order.Target == foundation))
            {
                continue;
            }
            var builders = Builders(view, foundation.Position, 1);
            if (builders.Count > 0)
            {
                Issue(new ConstructCommand { Units = builders, Target = foundation.Id });
            }
        }
    }

    /// <summary>True when the building is affordable over the hero's revive; otherwise records its cost as pending.</summary>
    private bool Want(BuildingDef def)
    {
        return Want(def, _heroReserve);
    }

    private bool Want(BuildingDef def, int[] reserve)
    {
        if (CanAffordAbove(_player, def.CostAmounts, reserve))
        {
            return true;
        }
        for (var i = 0; i < Resources.Count; i++)
        {
            PendingCost[i] += def.CostAmounts[i];
        }
        return false;
    }

    private void TryBuild(BotView view, BuildingDef def, Vector2 near, int minRadius, int maxRadius, int builders)
    {
        var found = BuildSpotFinder.TryFind(_game, _player, def, near, minRadius, maxRadius, out var spot)
            || BuildSpotFinder.TryFind(_game, _player, def, view.Home, maxRadius, maxRadius + FallbackRings, out spot);
        if (!found)
        {
            return;
        }
        var chosen = Builders(view, spot.Center, builders);
        if (chosen.Count > 0)
        {
            Issue(new BuildCommand { Units = chosen, Building = def.Id, X = spot.X, Y = spot.Y });
        }
    }

    private static List<int> Builders(BotView view, Vector2 near, int count)
    {
        return view.Villagers
            .Where(v => v.Order.Type is not OrderType.Build)
            .OrderBy(v => Vector2.DistanceSquared(v.Position, near))
            .ThenBy(v => v.Id)
            .Take(count)
            .Select(v => v.Id)
            .ToList();
    }

    private Vector2 AwayFromCenter(Vector2 home)
    {
        return home * 2 - _game.MapCenter;
    }

    private static Vector2 Rotate(Vector2 origin, Vector2 point, float angle)
    {
        var (sin, cos) = MathF.SinCos(angle);
        var delta = point - origin;
        return origin + new Vector2(delta.X * cos - delta.Y * sin, delta.X * sin + delta.Y * cos);
    }

    public static Vector2 Toward(Vector2 from, Vector2 to, float distance)
    {
        var delta = to - from;
        return delta.LengthSquared() < 0.01f ? from : from + Vector2.Normalize(delta) * distance;
    }

    private void Issue(PlayerCommand command)
    {
        _game.Commands.Apply(_player, command);
    }

    /// <summary>Whether the stockpile covers a cost and still keeps <paramref name="reserve"/> of every resource the cost spends.</summary>
    public static bool CanAffordAbove(Player player, int[] cost, int[] reserve)
    {
        for (var i = 0; i < Resources.Count; i++)
        {
            if (cost[i] > 0 && player.Stock[(ResourceType)i] < cost[i] + reserve[i])
            {
                return false;
            }
        }
        return true;
    }
}
