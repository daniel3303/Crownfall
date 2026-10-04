using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>
/// Building upgrades and storage for a bot. When any resource nears its cap it adds a storehouse near home, then
/// upgrades storehouses and the town center; otherwise it upgrades the town center as the economy grows and
/// barracks, towers and farms while resources float. Every purchase leaves the economy's reserve untouched.
/// </summary>
public sealed class BotUpgrades
{
    // Share of a storage cap at which the bot makes room before income is lost.
    private const float StoragePressure = 0.8f;

    // Storehouses built for storage on top of the ones the builder places at distant work.
    private const int ExtraStorehouses = 3;
    private const int StorehouseMinRing = 4;
    private const int StorehouseMaxRing = 10;
    private const int MaxConcurrentUpgrades = 2;

    // Villagers a bot keeps before it pauses its town center for the next level.
    private static readonly int[] TownCenterVillagers = [0, 16, 24];

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotProfile _profile;

    public BotUpgrades(Game game, Player player, BotProfile profile)
    {
        _game = game;
        _player = player;
        _profile = profile;
    }

    public void Run(BotView view, int[] reserve, bool urgent)
    {
        if (view.TownCenter == null || view.Villagers.Count == 0)
        {
            return;
        }
        if (StorageTight())
        {
            ExpandStorage(view, reserve);
            return;
        }
        if (view.Buildings.Count(b => b.IsUpgrading) >= MaxConcurrentUpgrades)
        {
            return;
        }
        var floating = Resources.Total(_player.Stock.Snapshot()) > BotBuilder.FloatingBank;
        var pick = TownCenterDue(view, urgent)
            ?? (floating || urgent ? Next(view, "tower") : null)
            ?? (floating ? Next(view, "barracks") ?? Next(view, "farm") : null);
        if (pick != null)
        {
            TryUpgrade(pick, reserve);
        }
    }

    /// <summary>True when some resource is close enough to its cap that more income would soon be lost.</summary>
    public bool StorageTight()
    {
        foreach (var type in Resources.All)
        {
            var cap = _player.Stock.Cap(type);
            if (cap > 0 && _player.Stock[type] >= cap * StoragePressure)
            {
                return true;
            }
        }
        return false;
    }

    private void ExpandStorage(BotView view, int[] reserve)
    {
        if (view.Buildings.Any(b => b.Def.Id == "storehouse" && (!b.IsComplete || b.IsUpgrading)))
        {
            return;
        }
        var storehouse = _game.Content.Building("storehouse");
        if (view.Count("storehouse") < _profile.MaxStorehouses + ExtraStorehouses && CanAfford(storehouse.CostAmounts, reserve))
        {
            BuildNearHome(view, storehouse);
            return;
        }
        var upgrade = Next(view, "storehouse") ?? Next(view, "townCenter");
        if (upgrade != null)
        {
            TryUpgrade(upgrade, reserve);
        }
    }

    private Building TownCenterDue(BotView view, bool urgent)
    {
        var center = view.TownCenter;
        if (urgent || center.IsUpgrading || center.Level >= TownCenterVillagers.Length)
        {
            return null;
        }
        return view.Villagers.Count >= TownCenterVillagers[center.Level] ? Next(view, "townCenter") : null;
    }

    /// <summary>The lowest-level finished building of a kind that can be upgraded now, oldest first.</summary>
    private Building Next(BotView view, string buildingId)
    {
        return view.Buildings
            .Where(b => b.Def.Id == buildingId && _game.Upgrades.Refusal(_player, b) == null)
            .OrderBy(b => b.Level)
            .ThenBy(b => b.Id)
            .FirstOrDefault();
    }

    private void TryUpgrade(Building building, int[] reserve)
    {
        if (CanAfford(building.NextStats.UpgradeCost, reserve))
        {
            _game.Commands.Apply(_player, new UpgradeCommand { Building = building.Id });
        }
    }

    private void BuildNearHome(BotView view, Content.BuildingDef def)
    {
        if (!BuildSpotFinder.TryFind(_game, _player, def, view.Home, StorehouseMinRing, StorehouseMaxRing, out var spot))
        {
            return;
        }
        var builder = view.Villagers
            .Where(v => v.Order.Type is not OrderType.Build)
            .OrderBy(v => System.Numerics.Vector2.DistanceSquared(v.Position, spot.Center))
            .ThenBy(v => v.Id)
            .FirstOrDefault();
        if (builder != null)
        {
            _game.Commands.Apply(_player, new BuildCommand { Units = [builder.Id], Building = def.Id, X = spot.X, Y = spot.Y });
        }
    }

    private bool CanAfford(int[] cost, int[] reserve)
    {
        return BotBuilder.CanAffordAbove(_player, cost, reserve);
    }
}
