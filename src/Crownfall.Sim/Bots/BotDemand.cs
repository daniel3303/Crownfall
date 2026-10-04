using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>Turns what a bot plans to spend over the next minute into villager targets per resource.</summary>
public sealed class BotDemand
{
    private const float HorizonSeconds = 60f;

    // Share of a villager's time spent gathering rather than walking cargo to a drop site.
    private const float TripEfficiency = 0.6f;

    // Banked resources still pull a little labour so a full bank never idles every gatherer.
    private const float GrossWeight = 0.15f;

    private const int MinWoodWorkersFrom = 6;

    // A fallen hero's revive is gathered to be ready when its cooldown ends, but never faster than this.
    private const float MinReviveSeconds = 20f;

    // The most of the workforce a revive pulls off the economy; more costs Hard bots wins against Easy ones.
    private const float MaxReviveShare = 0.25f;

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotProfile _profile;
    private readonly BotCombatModel _model;
    private readonly float[] _gross = new float[Resources.Count];

    public BotDemand(Game game, Player player, BotProfile profile, BotCombatModel model)
    {
        _game = game;
        _player = player;
        _profile = profile;
        _model = model;
    }

    /// <summary>
    /// Villagers wanted on each resource, summing to <paramref name="workers"/>. The bank covers a fallen hero's revive
    /// (<paramref name="heroReserve"/>) first; what it lacks gets its own villagers, up to a quarter of them, paced to be ready
    /// in <paramref name="reviveSeconds"/>, and the rest split over the minute of planned spending.
    /// </summary>
    public int[] Targets(BotView view, int workers, IReadOnlyList<float> armyMix, int[] pendingCost, int[] heroReserve, float reviveSeconds, bool[] available, bool berries)
    {
        Array.Clear(_gross);
        AddVillagerSpending(view);
        AddArmySpending(view, armyMix);
        AddHousing(view, armyMix);
        var stock = _player.Stock;
        var weights = new float[Resources.Count];
        var revive = new float[Resources.Count];
        var reviveTime = MathF.Max(MinReviveSeconds, reviveSeconds);
        foreach (var type in Resources.All)
        {
            var index = (int)type;
            if (!available[index])
            {
                continue;
            }
            var rate = GatherRate(type, berries);
            revive[index] = MathF.Max(0, heroReserve[index] - stock[type]) / (rate * reviveTime);
            var need = _gross[index] + pendingCost[index] - MathF.Max(0, stock[type] - heroReserve[index]);
            weights[index] = (MathF.Max(0, need) + GrossWeight * _gross[index]) / (rate * HorizonSeconds);
        }
        var reviveTargets = ReviveWorkers(revive, workers);
        var targets = Split(weights, workers - reviveTargets.Sum(), available);
        for (var i = 0; i < Resources.Count; i++)
        {
            targets[i] += reviveTargets[i];
        }
        return targets;
    }

    /// <summary>At least one villager on each resource the revive lacks, at most a quarter of the workforce in all.</summary>
    internal static int[] ReviveWorkers(float[] wanted, int workers)
    {
        var targets = new int[Resources.Count];
        var cap = (int)(workers * MaxReviveShare);
        for (var i = 0; i < Resources.Count; i++)
        {
            targets[i] = (int)MathF.Ceiling(wanted[i]);
        }
        while (targets.Sum() > cap)
        {
            var largest = Array.IndexOf(targets, targets.Max());
            targets[largest]--;
        }
        return targets;
    }

    private void AddVillagerSpending(BotView view)
    {
        if (view.TownCenter == null || view.Villagers.Count >= _profile.TargetVillagers)
        {
            return;
        }
        var villager = _game.Content.Units.First(u => u.IsVillager);
        AddRate(villager.CostAmounts, HorizonSeconds / _game.Production.TrainSeconds(_player, villager));
    }

    private void AddArmySpending(BotView view, IReadOnlyList<float> armyMix)
    {
        var barracks = view.Count("barracks", includeUnfinished: false);
        if (barracks == 0 || _player.Population >= _game.Content.Rules.PopulationLimit - 1)
        {
            return;
        }
        for (var i = 0; i < _model.Military.Count; i++)
        {
            var unit = _model.Military[i];
            AddRate(unit.CostAmounts, armyMix[i] * barracks * HorizonSeconds / _game.Production.TrainSeconds(_player, unit));
        }
    }

    private void AddHousing(BotView view, IReadOnlyList<float> armyMix)
    {
        var rules = _game.Content.Rules;
        if (_player.PopulationCap >= rules.PopulationLimit)
        {
            return;
        }
        var house = _game.Content.Building("house");
        var producers = (view.TownCenter != null ? 1 : 0) + view.Count("barracks", includeUnfinished: false);
        var popPerHorizon = producers * HorizonSeconds / AverageTrainSeconds(armyMix);
        AddRate(house.CostAmounts, popPerHorizon / Math.Max(1, house.Pop));
    }

    private float AverageTrainSeconds(IReadOnlyList<float> armyMix)
    {
        var seconds = 0f;
        for (var i = 0; i < _model.Military.Count; i++)
        {
            seconds += armyMix[i] * _game.Production.TrainSeconds(_player, _model.Military[i]);
        }
        return MathF.Max(seconds, 1);
    }

    private void AddRate(int[] cost, float times)
    {
        for (var i = 0; i < Resources.Count; i++)
        {
            _gross[i] += cost[i] * times;
        }
    }

    private float GatherRate(ResourceType type, bool berries)
    {
        var villager = _game.Content.Units.First(u => u.IsVillager);
        var rate = villager.GatherRate(type) * _player.Race.GatherMultiplier * TripEfficiency;
        if (type == ResourceType.Food && !berries)
        {
            rate *= _game.Content.Building("farm").FoodRate / TripEfficiency;
        }
        return MathF.Max(rate, 0.01f);
    }

    /// <summary>Largest-remainder split, keeping a couple of woodcutters for houses once the economy is running.</summary>
    private static int[] Split(float[] weights, int workers, bool[] available)
    {
        var targets = new int[Resources.Count];
        if (workers <= 0)
        {
            return targets;
        }
        var reserved = 0;
        var wood = (int)ResourceType.Wood;
        if (workers >= MinWoodWorkersFrom && available[wood])
        {
            targets[wood] = 2;
            reserved = 2;
        }
        var total = weights.Sum();
        if (total <= 0)
        {
            weights = new float[Resources.Count];
            weights[(int)ResourceType.Food] = 1;
            weights[wood] = available[wood] ? 1 : 0;
            total = weights.Sum();
        }
        var remaining = workers - reserved;
        var remainders = new float[Resources.Count];
        var assigned = 0;
        for (var i = 0; i < Resources.Count; i++)
        {
            var exact = weights[i] / total * remaining;
            var whole = (int)exact;
            targets[i] += whole;
            remainders[i] = exact - whole;
            assigned += whole;
        }
        for (; assigned < remaining; assigned++)
        {
            var best = 0;
            for (var i = 1; i < Resources.Count; i++)
            {
                if (remainders[i] > remainders[best])
                {
                    best = i;
                }
            }
            targets[best]++;
            remainders[best] = -1;
        }
        return targets;
    }
}
