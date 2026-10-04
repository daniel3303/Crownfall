using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;

namespace Crownfall.Sim.Systems;

/// <summary>
/// Timed building upgrades. Starting one pays its price up front; the building keeps working at its old stats
/// (training pauses) until the upgrade lands, then takes the new level with its health share unchanged.
/// Cancelling refunds the full price.
/// </summary>
public sealed class UpgradeSystem
{
    private readonly Game _game;

    public UpgradeSystem(Game game)
    {
        _game = game;
    }

    public void Update()
    {
        foreach (var building in _game.Entities.Buildings)
        {
            if (building.IsAlive && building.IsUpgrading)
            {
                Advance(building);
            }
        }
    }

    /// <summary>Why the player cannot upgrade the building now, or null when they can (affordability aside).</summary>
    public string Refusal(Player player, Building building)
    {
        if (building.Owner != player || !building.IsAlive || !building.IsComplete)
        {
            return "Only your completed buildings can be upgraded.";
        }
        if (building.IsUpgrading)
        {
            return "That building is already upgrading.";
        }
        var next = building.NextStats;
        if (next == null)
        {
            return $"{building.Def.Name} is at its highest level.";
        }
        if (TownCenterLevel(player) < next.TownCenterLevel)
        {
            return $"Requires a level {next.TownCenterLevel} town center.";
        }
        return null;
    }

    public void Start(Player player, int buildingId)
    {
        if (_game.Entities.Get(buildingId) is not Building building)
        {
            return;
        }
        var refusal = Refusal(player, building);
        if (refusal != null)
        {
            _game.Notify(player, refusal, NoticeTone.Warning, null);
            return;
        }
        var cost = building.NextStats.UpgradeCost;
        if (!player.Stock.TrySpend(cost))
        {
            _game.Notify(player, $"Not enough {player.Stock.DescribeShortfall(cost)} to upgrade.", NoticeTone.Warning, null);
            return;
        }
        building.IsUpgrading = true;
        building.UpgradeProgress = 0;
        building.UpgradePaid = (int[])cost.Clone();
    }

    public void Cancel(Player player, int buildingId)
    {
        if (_game.Entities.Get(buildingId) is not Building { IsUpgrading: true } building || building.Owner != player)
        {
            return;
        }
        building.IsUpgrading = false;
        building.UpgradeProgress = 0;
        player.Stock.Add(building.UpgradePaid);
        building.UpgradePaid = null;
    }

    /// <summary>The highest level among the player's completed town centers, or 0 without one.</summary>
    public int TownCenterLevel(Player player)
    {
        var level = 0;
        foreach (var building in _game.Entities.Buildings)
        {
            if (building.Owner == player && building.IsAlive && building.IsComplete && building.Def.IsTownCenter)
            {
                level = Math.Max(level, building.Level);
            }
        }
        return level;
    }

    private void Advance(Building building)
    {
        building.UpgradeProgress += _game.Dt / building.NextStats.UpgradeSeconds;
        if (building.UpgradeProgress >= 1)
        {
            Complete(building);
        }
    }

    private void Complete(Building building)
    {
        var share = building.MaxHp > 0 ? building.Hp / building.MaxHp : 1;
        building.Level++;
        building.IsUpgrading = false;
        building.UpgradeProgress = 0;
        building.UpgradePaid = null;
        building.MaxHp = _game.BuildingMaxHp(building.Stats, building.Owner);
        building.Hp = MathF.Max(1, share * building.MaxHp);
        var owner = building.Owner;
        _game.Events.Add(new UpgradedEvent
        {
            Player = owner.Index,
            Team = owner.Team,
            Id = building.Id,
            What = building.Def.Id,
            Level = building.Level,
            X = building.Position.X,
            Y = building.Position.Y,
        });
        _game.Notify(owner, $"{building.Def.Name} reached level {building.Level}.", NoticeTone.Success, building.Position);
    }
}
