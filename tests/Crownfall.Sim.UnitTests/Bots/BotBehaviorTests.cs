using System.Numerics;
using Crownfall.Sim.Bots;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Bots;

/// <summary>A bot against an idle seat, so each behavior can be provoked on its own.</summary>
public class BotBehaviorTests
{
    private readonly ITestOutputHelper _output;

    public BotBehaviorTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Fact]
    public void Defense_BaseRaidedWhileArmyMarchesOut_ArmyComesHome()
    {
        var game = TestGames.Create(seed: 3);
        var bot = game.Players[0];
        var raider = game.Players[1];
        TestGames.EnableBot(game, bot, BotDifficulty.Hard);
        var home = game.TownCenter(bot).Position;
        for (var i = 0; i < 10; i++)
        {
            game.Spawn("spearman", bot, game.Walkable(BotBuilder.Toward(home, game.MapCenter, 6) + new Vector2(i % 5, i / 5)));
        }

        // With nothing known about the idle enemy, the bot marches on the likeliest enemy start.
        RunUntil(game, TestGames.Seconds(150), () => Vector2.Distance(Centroid(Army(game, bot)), home) > 25);
        Army(game, bot).Should().HaveCountGreaterThanOrEqualTo(8, "the army should still be marching, not lost");
        Vector2.Distance(Centroid(Army(game, bot)), home).Should().BeGreaterThan(25, "the army should have marched out first");
        var raidPoint = game.Walkable(BotBuilder.Toward(home, game.MapCenter, -6));
        for (var i = 0; i < 4; i++)
        {
            game.Spawn("rider", raider, raidPoint + new Vector2(i, 0));
        }
        var raidTick = game.Tick;

        var home80 = RunUntil(game, TestGames.Seconds(30), () => Army(game, bot).Count(u => Vector2.Distance(u.Position, raidPoint) <= 14) >= 0.8f * Army(game, bot).Count);

        _output.WriteLine($"army home {(game.Tick - raidTick) / 10f:F1} s after the raid");
        home80.Should().BeTrue("the army should turn back and meet a raid on its base within 30 seconds");
        Army(game, bot).Should().HaveCountGreaterThanOrEqualTo(8, "the soldiers that came home should be the marching army");
    }

    [Fact]
    public void Revive_HeroFallsWithJustItsReviveBanked_BotSpendsNoneOfItAndRevivesOnCooldown()
    {
        var game = TestGames.Create(seed: 3);
        var bot = game.Players[0];
        TestGames.EnableBot(game, bot, BotDifficulty.Normal);
        TestGames.Run(game, TestGames.Seconds(60));
        var cost = game.Content.HeroReviveCost(bot.HeroState.Level);
        bot.Stock.TrySpend(bot.Stock.Snapshot());
        bot.Stock.Add(cost);

        game.Kill(bot.Hero, game.Players[1]);
        var lowest = cost.ToArray();
        while (game.Tick < bot.HeroState.ReviveTick && !game.IsOver)
        {
            TestGames.Run(game, 1);
            for (var i = 0; i < Resources.Count; i++)
            {
                lowest[i] = Math.Min(lowest[i], bot.Stock[(ResourceType)i]);
            }
        }
        TestGames.Run(game, TestGames.Seconds(3));

        lowest.Should().Equal(cost, "villagers, buildings and upgrades must leave the revive cost alone while the hero is down");
        bot.Hero.Should().NotBeNull("the bot should pay for its hero as soon as the cooldown ends");
    }

    [Fact]
    public void Revive_HeroFallsWhileEnemiesThreatenItsBase_EmergencyTroopsLeaveTheReviveAlone()
    {
        var game = TestGames.Create(seed: 3);
        var bot = game.Players[0];
        var enemy = game.Players[1];
        TestGames.EnableBot(game, bot, BotDifficulty.Normal);
        TestGames.Run(game, TestGames.Seconds(30));
        var home = game.TownCenter(bot).Position;
        game.Place("barracks", bot, home);
        for (var i = 0; i < 3; i++)
        {
            game.Spawn("rider", enemy, game.Walkable(home + new Vector2(5 + i, 5)));
        }
        var cost = game.Content.HeroReviveCost(bot.HeroState.Level);
        bot.Stock.TrySpend(bot.Stock.Snapshot());
        bot.Stock.Add(cost);
        bot.Stock.Store(ResourceType.Wood, 200);

        game.Kill(bot.Hero, enemy);
        var lowest = cost.ToArray();
        for (var tick = 0; tick < TestGames.Seconds(3); tick++)
        {
            TestGames.Run(game, 1);
            for (var i = 0; i < Resources.Count; i++)
            {
                lowest[i] = Math.Min(lowest[i], bot.Stock[(ResourceType)i]);
            }
        }

        lowest.Should().Equal(cost, "emergency troops in the very next think must already leave the revive cost alone");
    }

    [Fact]
    public void Revive_TeammatesHeroFallsInASharedPool_EveryBotOnTheTeamLeavesItsReviveAlone()
    {
        var game = TestGames.Create(perTeam: 2, seed: 3, sharing: ResourceSharing.Shared);
        var fallen = game.Players[0];
        var mate = game.Players.Single(p => p != fallen && p.Team == fallen.Team);
        TestGames.EnableBot(game, fallen, BotDifficulty.Normal);
        TestGames.EnableBot(game, mate, BotDifficulty.Normal);
        TestGames.Run(game, TestGames.Seconds(60));
        mate.Stock.Should().BeSameAs(fallen.Stock, "a shared team draws on one stockpile");
        var cost = game.Heroes.ReviveCost(fallen);
        fallen.Stock.TrySpend(fallen.Stock.Snapshot());
        fallen.Stock.Add(cost);

        game.Kill(fallen.Hero, game.Players.First(p => p.Team != fallen.Team));
        var lowest = cost.ToArray();
        while (game.Tick < fallen.HeroState.ReviveTick && !game.IsOver)
        {
            TestGames.Run(game, 1);
            for (var i = 0; i < Resources.Count; i++)
            {
                lowest[i] = Math.Min(lowest[i], fallen.Stock[(ResourceType)i]);
            }
        }
        TestGames.Run(game, TestGames.Seconds(3));

        lowest.Should().Equal(cost, "the teammate's bot must not spend the shared pool's revive money either");
        fallen.Hero.Should().NotBeNull("the fallen hero's bot should pay for it as soon as the cooldown ends");
    }

    [Fact]
    public void Revive_HeroFallsWithAnEmptyBank_BotGathersItAndRevivesSoonAfterTheCooldown()
    {
        var game = TestGames.Create(seed: 3);
        var bot = game.Players[0];
        TestGames.EnableBot(game, bot, BotDifficulty.Normal);
        TestGames.Run(game, TestGames.Seconds(60));
        bot.Stock.TrySpend(bot.Stock.Snapshot());

        game.Kill(bot.Hero, game.Players[1]);
        var ready = bot.HeroState.ReviveTick;
        var revived = RunUntil(game, ready - game.Tick + TestGames.Seconds(90), () => bot.Hero != null);

        _output.WriteLine($"hero back {(game.Tick - ready) / 10f:F1} s after its cooldown");
        revived.Should().BeTrue("the bot should put villagers on the revive cost and pay it within 90 s of the cooldown ending");
    }

    [Fact]
    public void Counters_ScoutedRiders_ShiftsTrainingToSpearmen()
    {
        var unscouted = TrainAfterScouting(null);
        var scouted = TrainAfterScouting("rider");

        _output.WriteLine($"unscouted {Describe(unscouted)}; riders scouted {Describe(scouted)}");
        scouted.Values.Sum().Should().BeGreaterThanOrEqualTo(8);
        Share(scouted, "spearman").Should().BeGreaterThanOrEqualTo(Share(unscouted, "spearman") + 0.1f, "spearmen trade best against riders");
        Share(scouted, "spearman").Should().BeGreaterThanOrEqualTo(0.6f);
        Share(scouted, "rider").Should().BeLessThan(Share(unscouted, "rider"), "riders trade poorly against riders' counters");
    }

    [Fact]
    public void Counters_ScoutedArchers_ShiftsTrainingToRiders()
    {
        var unscouted = TrainAfterScouting(null);
        var scouted = TrainAfterScouting("archer");

        _output.WriteLine($"unscouted {Describe(unscouted)}; archers scouted {Describe(scouted)}");
        Share(scouted, "rider").Should().BeGreaterThanOrEqualTo(Share(unscouted, "rider") + 0.1f, "riders trade best against archers");
        Share(scouted, "spearman").Should().BeLessThan(Share(unscouted, "spearman"));
        scouted.GetValueOrDefault("rider").Should().BeGreaterThan(scouted.GetValueOrDefault("spearman"));
    }

    [Fact]
    public void Economy_NormalBotAfterMinuteFive_KeepsItsBankSmall()
    {
        var game = TestGames.CreateDuel(BotDifficulty.Normal, BotDifficulty.Normal, seed: 3);
        var samples = game.Players.ToDictionary(p => p.Index, _ => new List<int>());

        TestGames.Run(game, TestGames.Seconds(5 * 60));
        while (game.Tick < TestGames.Seconds(15 * 60) && !game.IsOver)
        {
            TestGames.Run(game, TestGames.Seconds(30));
            foreach (var player in game.Players)
            {
                // What a bot banks for its fallen hero's revive is meant to be kept, so it does not count as idle.
                var revive = player.Hero == null ? game.Heroes.ReviveCost(player).Sum() : 0;
                samples[player.Index].Add(Math.Max(0, player.Stock.Snapshot().Sum() - revive));
            }
        }

        foreach (var player in game.Players)
        {
            var banks = samples[player.Index];
            _output.WriteLine($"{player.Name}: banks {string.Join(" ", banks)}");
            banks.Count(bank => bank < 1000).Should().BeGreaterThanOrEqualTo((int)(banks.Count * 0.8f), $"{player.Name} should spend what it gathers");
        }
    }

    /// <summary>
    /// A Hard bot with barracks and a full bank sees six enemy soldiers of one type, or none when null, which then die in
    /// its view; returns how many of each soldier it trains in the next minute.
    /// </summary>
    private static Dictionary<string, int> TrainAfterScouting(string enemyUnit)
    {
        var game = TestGames.Create(seed: 4);
        var bot = game.Players[0];
        var enemy = game.Players[1];
        var home = game.TownCenter(bot).Position;
        Place(game, bot, "barracks", BotBuilder.Toward(home, game.MapCenter, 6));
        Place(game, bot, "barracks", BotBuilder.Toward(home, game.MapCenter, 6));
        for (var i = 0; i < 4; i++)
        {
            Place(game, bot, "house", BotBuilder.Toward(home, game.MapCenter, -6));
        }
        foreach (var type in Enum.GetValues<ResourceType>())
        {
            bot.Stock.Add(type, 5000);
        }
        TestGames.EnableBot(game, bot, BotDifficulty.Hard);
        var seen = Enumerable.Range(0, enemyUnit == null ? 0 : 6)
            .Select(i => game.Spawn(enemyUnit, enemy, game.Walkable(BotBuilder.Toward(home, game.MapCenter, -5) + new Vector2(i % 3, i / 3))))
            .ToList();

        TestGames.Run(game, TestGames.Seconds(1));
        foreach (var unit in seen)
        {
            game.Kill(unit, null);
        }
        var before = Soldiers(game, bot);
        TestGames.Run(game, TestGames.Seconds(60));
        var after = Soldiers(game, bot);

        return after.ToDictionary(kv => kv.Key, kv => kv.Value - before.GetValueOrDefault(kv.Key));
    }

    private static float Share(Dictionary<string, int> trained, string unitId)
    {
        var total = trained.Values.Sum();
        return total == 0 ? 0 : trained.GetValueOrDefault(unitId) / (float)total;
    }

    private static string Describe(Dictionary<string, int> trained)
    {
        return string.Join(", ", trained.OrderBy(kv => kv.Key).Select(kv => $"{kv.Key} {kv.Value}"));
    }

    private static void Place(Game game, Player player, string buildingId, Vector2 near)
    {
        var def = game.Content.Building(buildingId);
        BuildSpotFinder.TryFind(game, player, def, near, 2, 12, out var spot).Should().BeTrue();
        game.PlaceBuilding(def, player, spot, complete: true);
    }

    /// <summary>Soldiers owned or queued, by type.</summary>
    private static Dictionary<string, int> Soldiers(Game game, Player player)
    {
        var queued = game.Entities.Buildings.Where(b => b.Owner == player).SelectMany(b => b.Queue).Select(q => q.Unit);
        return game.Entities.Units.Where(u => u.Owner == player && u.IsAlive && u.Def.IsMilitary).Select(u => u.Def)
            .Concat(queued.Where(u => u.IsMilitary))
            .GroupBy(u => u.Id)
            .ToDictionary(g => g.Key, g => g.Count());
    }

    private static List<Unit> Army(Game game, Player player)
    {
        return game.Entities.Units.Where(u => u.Owner == player && u.IsAlive && u.Def.IsMilitary).ToList();
    }

    private static Vector2 Centroid(List<Unit> units)
    {
        return units.Count == 0 ? Vector2.Zero : units.Aggregate(Vector2.Zero, (sum, u) => sum + u.Position) / units.Count;
    }

    private static bool RunUntil(Game game, int ticks, Func<bool> done)
    {
        for (var i = 0; i < ticks && !game.IsOver; i++)
        {
            game.Step([]);
            if (done())
            {
                return true;
            }
        }
        return false;
    }
}
