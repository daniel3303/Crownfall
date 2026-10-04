using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>Bot economy: trains villagers, puts them on the resources planned spending needs, and moves them as needs change.</summary>
public sealed class BotEconomy
{
    private const int RebalanceTicks = 30;

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotProfile _profile;
    private readonly BotSites _sites;
    private readonly BotBuilder _builder;
    private readonly BotDemand _demand;
    private readonly int[] _counts = new int[Resources.Count];
    private int[] _targets = new int[Resources.Count];
    private int _nextRebalanceTick;

    public BotEconomy(Game game, Player player, BotProfile profile, BotMemory memory, BotCombatModel model)
    {
        _game = game;
        _player = player;
        _profile = profile;
        _sites = new BotSites(game, player, memory);
        _builder = new BotBuilder(game, player, profile, memory);
        _demand = new BotDemand(game, player, profile, model);
    }

    /// <summary>Whether the bot knows somewhere to gather each resource.</summary>
    public bool[] Available => _sites.Available;

    /// <summary>Resources the army must leave unspent for villagers and housing.</summary>
    public int[] Reserve { get; } = new int[Resources.Count];

    /// <summary><see cref="Reserve"/> plus <see cref="HeroReserve"/>, which soldiers must not spend either.</summary>
    public int[] ArmyReserve { get; } = new int[Resources.Count];

    /// <summary>
    /// The revive cost of every fallen hero on this stockpile (in a shared team pool, teammates' too), set aside from the
    /// moment each falls: villagers, buildings, upgrades and soldiers, even emergency ones, only spend above it.
    /// </summary>
    public int[] HeroReserve { get; } = new int[Resources.Count];

    /// <summary>Refreshes gather sites and the revive reserve; runs before any spender in a think, so none misses a hero that just fell.</summary>
    public void Prepare(BotView view)
    {
        _sites.Refresh(view);
        Array.Copy(ReviveCost(), HeroReserve, Resources.Count);
    }

    /// <summary>One economy pass after <see cref="Prepare"/>; while <paramref name="urgent"/> the town center queues one villager at a time and farms wait.</summary>
    public void Run(BotView view, IReadOnlyList<float> armyMix, BotVillagerGuard guard, bool urgent)
    {
        TrainVillagers(view, urgent ? 1 : _profile.VillagerQueue);
        var workers = view.Villagers.Count(v => v.Order.Type != OrderType.Build);
        _targets = _demand.Targets(view, workers, armyMix, _builder.PendingCost, HeroReserve, ReviveSecondsLeft(), _sites.Available, _sites.HasBerries);
        _builder.Run(view, _sites, _targets[(int)ResourceType.Food], urgent, HeroReserve);
        CountJobs(view);
        AssignIdle(view, guard);
        if (view.Tick >= _nextRebalanceTick)
        {
            _nextRebalanceTick = view.Tick + RebalanceTicks;
            Rebalance(view);
        }
        UpdateReserve(view);
        for (var i = 0; i < Resources.Count; i++)
        {
            ArmyReserve[i] = Reserve[i] + HeroReserve[i];
        }
    }

    /// <summary>
    /// What reviving every fallen hero that draws on this bot's stockpile costs, gathered for in advance: its own, and in a
    /// shared team pool its teammates' too, human or bot. Capped at the storage, and nothing while a resource it needs can
    /// neither be gathered nor is banked, since holding the rest back would only stall the economy.
    /// </summary>
    private int[] ReviveCost()
    {
        var total = new int[Resources.Count];
        foreach (var mate in FallenPoolMates())
        {
            var cost = _game.Heroes.ReviveCost(mate);
            for (var i = 0; i < Resources.Count; i++)
            {
                total[i] = Math.Min(total[i] + cost[i], _player.Stock.Cap((ResourceType)i));
            }
        }
        for (var i = 0; i < Resources.Count; i++)
        {
            if (total[i] > _player.Stock[(ResourceType)i] && !_sites.Available[i])
            {
                return new int[Resources.Count];
            }
        }
        return total;
    }

    /// <summary>Seconds until the first fallen hero on this stockpile may be revived; zero once one may, or while none is down.</summary>
    private float ReviveSecondsLeft()
    {
        var soonest = FallenPoolMates().Select(mate => mate.HeroState.ReviveTick).DefaultIfEmpty(_game.Tick).Min();
        return MathF.Max(0, soonest - _game.Tick) / _game.Content.Rules.TickRate;
    }

    /// <summary>Undefeated players sharing this bot's stockpile, itself included, whose hero is waiting for a revive.</summary>
    private IEnumerable<Player> FallenPoolMates()
    {
        return _game.Players.Where(mate => ReferenceEquals(mate.Stock, _player.Stock) && !mate.IsDefeated && mate.Hero == null && mate.HeroState.ReviveTick >= 0);
    }

    private void TrainVillagers(BotView view, int queue)
    {
        var townCenter = view.TownCenter;
        var full = townCenter == null || townCenter.Queue.Count >= queue || view.Villagers.Count + townCenter.Queue.Count >= _profile.TargetVillagers;
        if (full)
        {
            return;
        }
        // A fallen hero outweighs the next villager, so villagers only spend what the revives leave over.
        var villager = townCenter.Def.TrainableUnits.FirstOrDefault(u => u.IsVillager);
        if (villager != null && BotBuilder.CanAffordAbove(_player, villager.CostAmounts, HeroReserve))
        {
            Issue(new TrainCommand { Building = townCenter.Id, Unit = villager.Id });
        }
    }

    private void CountJobs(BotView view)
    {
        Array.Clear(_counts);
        foreach (var villager in view.Villagers)
        {
            if (BotJobs.JobOf(villager) is { } job)
            {
                _counts[(int)job]++;
            }
        }
    }

    private void AssignIdle(BotView view, BotVillagerGuard guard)
    {
        foreach (var villager in view.Villagers)
        {
            if (villager.Order.Type != OrderType.Idle || guard.IsSheltering(villager))
            {
                continue;
            }
            foreach (var job in JobsByNeed())
            {
                var command = _sites.CommandFor(villager, job);
                if (command != null)
                {
                    _counts[(int)job]++;
                    Issue(command);
                    break;
                }
            }
        }
    }

    /// <summary>Moves villagers from the most oversupplied resource to the most undersupplied one that has a free spot.</summary>
    private void Rebalance(BotView view)
    {
        for (var moved = 0; moved < _profile.RebalancePerThink; moved++)
        {
            var surplus = MostOver();
            if (surplus < 0)
            {
                return;
            }
            var villager = view.Villagers
                .Where(v => BotJobs.JobOf(v) == (ResourceType)surplus)
                .OrderBy(v => v.CarryAmount)
                .ThenBy(v => v.Id)
                .First();
            var command = JobsByNeed()
                .Where(job => _targets[(int)job] - _counts[(int)job] >= _profile.RebalanceSurplus)
                .Select(job => (Job: job, Command: _sites.CommandFor(villager, job)))
                .FirstOrDefault(c => c.Command != null);
            if (command.Command == null)
            {
                return;
            }
            Issue(command.Command);
            _counts[surplus]--;
            _counts[(int)command.Job]++;
        }
    }

    /// <summary>The resource furthest over its target, if by at least the profile's surplus.</summary>
    private int MostOver()
    {
        var best = -1;
        var bestGap = _profile.RebalanceSurplus - 1;
        for (var i = 0; i < Resources.Count; i++)
        {
            var gap = _counts[i] - _targets[i];
            if (gap > bestGap)
            {
                bestGap = gap;
                best = i;
            }
        }
        return best;
    }

    private IEnumerable<ResourceType> JobsByNeed()
    {
        return Resources.All
            .Where(type => _sites.Available[(int)type])
            .OrderByDescending(type => _targets[(int)type] - _counts[(int)type])
            .ThenBy(type => (int)type);
    }

    private void UpdateReserve(BotView view)
    {
        Array.Clear(Reserve);
        var townCenter = view.TownCenter;
        if (townCenter != null && townCenter.Queue.Count == 0 && view.Villagers.Count < _profile.TargetVillagers)
        {
            AddReserve(townCenter.Def.TrainableUnits.First(u => u.IsVillager).CostAmounts);
        }
        if (_builder.HousingTight)
        {
            AddReserve(_game.Content.Building("house").CostAmounts);
        }
    }

    private void AddReserve(int[] cost)
    {
        for (var i = 0; i < Resources.Count; i++)
        {
            Reserve[i] += cost[i];
        }
    }

    private void Issue(PlayerCommand command)
    {
        _game.Commands.Apply(_player, command);
    }
}
