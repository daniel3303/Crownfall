using System.Numerics;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>What a bot owns and what its team can see at the start of one think, gathered in a single pass.</summary>
public sealed class BotView
{
    private readonly Dictionary<string, int> _counts = [];
    private readonly Dictionary<string, int> _complete = [];
    private Vector2 _start;

    public int Tick { get; private set; }
    public List<Unit> Villagers { get; } = [];
    public List<Unit> Army { get; } = [];
    public List<Building> Buildings { get; } = [];
    public Building TownCenter { get; private set; }
    public Unit Hero { get; private set; }

    /// <summary>Visible units owned by enemy players, in id order.</summary>
    public List<Unit> EnemyUnits { get; } = [];

    /// <summary>Visible buildings owned by enemy players, in id order.</summary>
    public List<Building> EnemyBuildings { get; } = [];

    /// <summary>Visible neutral creeps.</summary>
    public List<Unit> Creeps { get; } = [];

    public Vector2 Home => TownCenter?.Position ?? Buildings.FirstOrDefault()?.Position ?? _start;

    /// <summary>Takes the snapshot; <paramref name="abandoned"/> foundations are left out as if they did not exist.</summary>
    public static BotView Capture(Game game, Player player, ISet<int> abandoned)
    {
        var view = new BotView { Hero = player.Hero, Tick = game.Tick, _start = player.Start.Center };
        foreach (var unit in game.Entities.Units)
        {
            if (unit.IsAlive)
            {
                view.AddUnit(game, player, unit);
            }
        }
        foreach (var building in game.Entities.Buildings)
        {
            if (!building.IsAlive)
            {
                continue;
            }
            if (building.Owner == player)
            {
                if (!abandoned.Contains(building.Id))
                {
                    view.AddOwnBuilding(building);
                }
            }
            else if (building.Team != player.Team && game.Vision.IsVisible(player.Team, building))
            {
                view.EnemyBuildings.Add(building);
            }
        }
        view.TownCenter = view.Buildings.FirstOrDefault(b => b.Def.IsTownCenter && b.IsComplete);
        return view;
    }

    public int Count(string buildingId, bool includeUnfinished = true)
    {
        var counts = includeUnfinished ? _counts : _complete;
        return counts.GetValueOrDefault(buildingId);
    }

    public bool IsConstructing(string buildingId)
    {
        return Count(buildingId) > Count(buildingId, includeUnfinished: false);
    }

    public int Constructing(string buildingId)
    {
        return Count(buildingId) - Count(buildingId, includeUnfinished: false);
    }

    private void AddUnit(Game game, Player player, Unit unit)
    {
        if (unit.Owner == player)
        {
            if (unit.Def.IsVillager)
            {
                Villagers.Add(unit);
            }
            else if (unit.Def.IsMilitary)
            {
                Army.Add(unit);
            }
            return;
        }
        if (unit.Team == player.Team || !game.Vision.IsVisible(player.Team, unit))
        {
            return;
        }
        if (unit.Owner != null)
        {
            EnemyUnits.Add(unit);
        }
        else if (unit.Def.IsCreep)
        {
            Creeps.Add(unit);
        }
    }

    private void AddOwnBuilding(Building building)
    {
        Buildings.Add(building);
        var id = building.Def.Id;
        _counts[id] = _counts.GetValueOrDefault(id) + 1;
        if (building.IsComplete)
        {
            _complete[id] = _complete.GetValueOrDefault(id) + 1;
        }
    }
}
