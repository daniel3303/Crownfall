using System.Numerics;
using Crownfall.Sim.Bots;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
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

    [Theory]
    [InlineData(BotDifficulty.Hard, true)]
    [InlineData(BotDifficulty.Brutal, false)]
    public void Attack_LevelOneHeroBesideAReadyArmy_OnlyBrutalWaitsForItsHero(BotDifficulty difficulty, bool marches)
    {
        var game = ArmyAtRally(difficulty);
        var bot = game.Players[0];
        var home = game.TownCenter(bot).Position;

        var marched = RunUntil(game, TestGames.Seconds(60), () => Vector2.Distance(Centroid(Army(game, bot)), home) > 25);

        marched.Should().Be(marches, "Hard marches a ready army at once, Brutal holds it so early waves do not feed the enemy hero");
    }

    [Fact]
    public void Attack_BrutalHeroReachesItsAttackLevel_ArmyMarches()
    {
        var game = ArmyAtRally(BotDifficulty.Brutal);
        var bot = game.Players[0];
        var home = game.TownCenter(bot).Position;
        // Held back for a minute first, so the test sees the gate open rather than never close.
        TestGames.Run(game, TestGames.Seconds(60));

        bot.HeroState.Level = BotProfile.For(BotDifficulty.Brutal).AttackHeroLevel;
        var marched = RunUntil(game, TestGames.Seconds(90), () => Vector2.Distance(Centroid(Army(game, bot)), home) > 25);

        marched.Should().BeTrue("once the hero reaches the attack level the army marches on the enemy");
    }

    [Theory]
    [InlineData(BotDifficulty.Hard, true)]
    [InlineData(BotDifficulty.Brutal, false)]
    public void Attack_LevelOneHeroAMinuteBeforeTheDeadline_BrutalWaitsOnlyUntilTheDeadline(BotDifficulty difficulty, bool marchesBefore)
    {
        var brutal = BotProfile.For(BotDifficulty.Brutal);
        var deadline = TestGames.Seconds(brutal.AttackHeroDeadlineSeconds);
        // An idle match keeps the hero at level 1 while the clock runs to a minute before Brutal's deadline.
        var game = ArmyAtRally(difficulty, idleTicks: deadline - TestGames.Seconds(60));
        var bot = game.Players[0];
        var home = game.TownCenter(bot).Position;

        var before = RunUntil(game, deadline - game.Tick, () => Vector2.Distance(Centroid(Army(game, bot)), home) > 25);
        var after = before || RunUntil(game, TestGames.Seconds(60), () => Vector2.Distance(Centroid(Army(game, bot)), home) > 25);

        before.Should().Be(marchesBefore, "Hard never waits for its hero, Brutal holds the army until the deadline");
        after.Should().BeTrue("past the deadline the army marches whatever the hero's level");
        bot.HeroState.Level.Should().BeLessThan(brutal.AttackHeroLevel, "only the deadline, not the hero, can have opened the gate");
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

    [Fact]
    public void Dragon_ArmyStrongEnoughForItButNotForTheEnemy_SlaysTheDragonAndGoesHome()
    {
        var game = TestGames.Create(seed: 3);
        var bot = game.Players[0];
        var enemy = game.Players[1];
        TestGames.EnableBot(game, bot, BotDifficulty.Hard);
        var home = game.TownCenter(bot).Position;
        var rally = BotBuilder.Toward(home, game.MapCenter, 6);
        for (var i = 0; i < 30; i++)
        {
            game.Spawn(i < 20 ? "spearman" : "archer", bot, game.Walkable(rally + new Vector2(i % 6 - 3, i / 6 - 2)));
        }
        bot.HeroState.Level = 6;
        bot.Hero.Position = game.Walkable(rally);
        SightAnOverwhelmingEnemyArmy(game, bot, enemy);
        game.Dragon.Lair.RespawnTick = game.Tick + 1;
        var dragonKiller = -1;
        var struck = false;
        var soldiers = Army(game, bot).Count;

        RunUntil(game, TestGames.Seconds(150), () =>
        {
            struck |= Army(game, bot).Any(u => u.Order.Target is Unit { Camp.IsLair: true });
            dragonKiller = game.Events.OfType<AnnouncementEvent>().FirstOrDefault(a => a.Type == AnnouncementType.DragonSlain)?.Player ?? dragonKiller;
            return dragonKiller >= 0;
        });
        var survivors = Army(game, bot).Count;
        // A dragon back soon after tests the wait between attempts; the real one returns minutes later.
        TestGames.Run(game, TestGames.Seconds(5));
        game.Dragon.Lair.RespawnTick = game.Tick + 1;
        var again = RunUntil(game, TestGames.Seconds(60), () => Army(game, bot).Any(u => u.Order.Target is Unit { IsAlive: true, Camp.IsLair: true }));

        _output.WriteLine($"slain by {dragonKiller}, {survivors} of {soldiers} soldiers left");
        struck.Should().BeTrue("the army should set on the dragon when it expects to lose few");
        dragonKiller.Should().Be(bot.Index);
        survivors.Should().BeGreaterThanOrEqualTo(soldiers - 9, "Hard only fights the dragon when the fight is cheap");
        again.Should().BeFalse("the army waits a while before another dragon fight");
        Army(game, bot).Count(u => Vector2.Distance(u.Position, rally) <= 12).Should().BeGreaterThanOrEqualTo((int)(0.7f * survivors), "the army comes home after the kill");
    }

    /// <summary>
    /// The bot glimpses an enemy army far larger than its own, which then marches home out of sight; remembering it keeps
    /// the bot from attacking, so the dragon is the only fight worth its army.
    /// </summary>
    private static void SightAnOverwhelmingEnemyArmy(Game game, Player bot, Player enemy)
    {
        var spot = game.Walkable(BotBuilder.Toward(game.TownCenter(bot).Position, game.MapCenter, 24));
        var scout = game.Spawn("rider", bot, spot);
        var blob = new List<Unit>();
        for (var i = 0; i < 60; i++)
        {
            blob.Add(game.Spawn("rider", enemy, game.Walkable(spot + new Vector2(4 + i % 6, i / 6 - 5))));
        }
        foreach (var unit in blob.Append(scout))
        {
            unit.StunUntilTick = game.Tick + TestGames.Seconds(2);
        }
        TestGames.Run(game, TestGames.Seconds(1));
        foreach (var unit in blob)
        {
            unit.Position = game.Walkable(enemy.Start.Center + new Vector2(0, 6));
            unit.StunUntilTick = game.Tick + TestGames.Seconds(600);
        }
        scout.Position = game.Walkable(BotBuilder.Toward(game.TownCenter(bot).Position, game.MapCenter, 4));
    }

    [Fact]
    public void Area_EnemyHeroWithALethalCleaveReady_HardSendsOnlyAFewSoldiersIntoItsReach()
    {
        var hard = CrowdAroundACleavingHero(BotDifficulty.Hard);
        var normal = CrowdAroundACleavingHero(BotDifficulty.Normal);

        _output.WriteLine($"soldiers inside the cleave: Hard {hard:F1}, Normal {normal:F1}");
        hard.Should().BeLessThanOrEqualTo(4, "Hard keeps all but a few baits out of a ready cleave that kills them outright");
        normal.Should().BeGreaterThan(hard + 2, "a profile that ignores area abilities crowds the hero");
    }

    /// <summary>
    /// Average count of the bot's spearmen inside a level 6 enemy hero's cleave over twelve seconds of defending against it;
    /// the hero is tough enough to outlast the fight and never casts, so its cleave stays ready.
    /// </summary>
    private static float CrowdAroundACleavingHero(BotDifficulty difficulty)
    {
        var game = TestGames.Create(seed: 3);
        var bot = game.Players[0];
        var enemy = game.Players[1];
        TestGames.EnableBot(game, bot, difficulty);
        var home = game.TownCenter(bot).Position;
        for (var i = 0; i < 12; i++)
        {
            game.Spawn("spearman", bot, game.Walkable(BotBuilder.Toward(home, game.MapCenter, 6) + new Vector2(i % 4, i / 4)));
        }
        var hero = enemy.Hero;
        enemy.HeroState.Level = 6;
        hero.MaxHp = 50000;
        hero.Hp = hero.MaxHp;
        hero.Position = game.Walkable(BotBuilder.Toward(home, game.MapCenter, 12));
        var cleave = enemy.HeroState.Kit[TestGames.Slot(enemy, "cleave")];
        var samples = 0;
        var inside = 0;
        for (var tick = 0; tick < TestGames.Seconds(16); tick++)
        {
            game.Step([]);
            if (tick < TestGames.Seconds(4))
            {
                continue;
            }
            samples++;
            inside += Army(game, bot).Count(u => Vector2.Distance(u.Position, hero.Position) <= cleave.Radius + u.Radius);
        }
        return inside / (float)samples;
    }

    [Fact]
    public void Uniques_LevelOneBarracks_NeverQueuesTheRacesUniqueUnit()
    {
        var game = BarracksBot(level: 1);
        var bot = game.Players[0];
        var queuedEarly = false;
        var refused = false;

        RunUntil(game, TestGames.Seconds(60), () =>
        {
            queuedEarly |= game.Entities.Buildings.Any(b => b.Owner == bot && b.Level < 2 && b.Queue.Any(q => q.Unit.Id == "knight"));
            refused |= game.Events.OfType<NoticeEvent>().Any(n => n.Player == bot.Index && n.Text.Contains("needs a level"));
            return false;
        });

        queuedEarly.Should().BeFalse("a knight needs a level 2 barracks");
        refused.Should().BeFalse("the bot never orders a unit its barracks cannot train yet");
    }

    [Fact]
    public void Uniques_LevelTwoBarracks_TrainsTheRacesUniqueUnitAndNoOther()
    {
        var game = BarracksBot(level: 2);
        var bot = game.Players[0];
        var before = Soldiers(game, bot);

        TestGames.Run(game, TestGames.Seconds(90));
        var trained = Soldiers(game, bot);

        _output.WriteLine($"trained {Describe(trained)}");
        trained.GetValueOrDefault("knight").Should().BeGreaterThan(before.GetValueOrDefault("knight"));
        trained.Should().NotContainKey("berserker");
    }

    /// <summary>
    /// A bot of the given difficulty, taking over after <paramref name="idleTicks"/> of an idle match, with fifteen spearmen
    /// gathered a little way from home toward the map center.
    /// </summary>
    private static Game ArmyAtRally(BotDifficulty difficulty, int idleTicks = 0)
    {
        var game = TestGames.Create(seed: 3);
        TestGames.Run(game, idleTicks);
        var bot = game.Players[0];
        TestGames.EnableBot(game, bot, difficulty);
        var home = game.TownCenter(bot).Position;
        for (var i = 0; i < 15; i++)
        {
            game.Spawn("spearman", bot, game.Walkable(BotBuilder.Toward(home, game.MapCenter, 6) + new Vector2(i % 5, i / 5)));
        }
        return game;
    }

    /// <summary>A Hard human bot with two barracks at the given level, houses and a full bank.</summary>
    private static Game BarracksBot(int level)
    {
        var game = TestGames.Create(seed: 4);
        var bot = game.Players[0];
        var home = game.TownCenter(bot).Position;
        Place(game, bot, "barracks", BotBuilder.Toward(home, game.MapCenter, 6));
        Place(game, bot, "barracks", BotBuilder.Toward(home, game.MapCenter, 6));
        foreach (var barracks in game.Entities.Buildings.Where(b => b.Owner == bot && b.Def.Id == "barracks"))
        {
            barracks.Level = level;
        }
        for (var i = 0; i < 4; i++)
        {
            Place(game, bot, "house", BotBuilder.Toward(home, game.MapCenter, -6));
        }
        foreach (var type in Enum.GetValues<ResourceType>())
        {
            bot.Stock.Add(type, 5000);
        }
        TestGames.EnableBot(game, bot, BotDifficulty.Hard);
        return game;
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
