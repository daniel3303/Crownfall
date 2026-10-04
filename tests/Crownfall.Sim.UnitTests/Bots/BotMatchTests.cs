using System.Diagnostics;
using Crownfall.Sim.Core;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Bots;

public class BotMatchTests
{
    // Matches have no time limit; a game still running here is judged by score.
    private const int HorizonMinutes = 20;

    private readonly ITestOutputHelper _output;

    public BotMatchTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Fact]
    public void BotMatch_TwoVersusTwo_GrowsEconomiesAndFights()
    {
        var game = TestGames.Create(teams: 2, perTeam: 2, bots: true, seed: 7, size: MapSize.Medium);
        var watch = Stopwatch.StartNew();

        TestGames.Run(game, TestGames.Seconds(15 * 60));

        watch.Stop();
        foreach (var player in game.Players)
        {
            _output.WriteLine($"{player.Name} team {player.Team}: pop {player.Population}/{player.PopulationCap} gathered {player.Stats.Gathered} " +
                $"trained {player.Stats.UnitsTrained} built {player.Stats.BuildingsBuilt} kills {player.Stats.Kills} losses {player.Stats.Losses} " +
                $"hero L{player.HeroState.Level} defeated {player.IsDefeated}");
        }
        _output.WriteLine($"tick {game.Tick} over {game.IsOver} winner {game.WinningTeam} in {watch.ElapsedMilliseconds} ms");
        game.Players.Should().OnlyContain(p => p.Stats.UnitsTrained >= 8, "every bot should train villagers and soldiers");
        game.Players.Should().OnlyContain(p => p.Stats.Gathered >= 1500, "every bot should run an economy");
        game.Players.Should().OnlyContain(p => p.Stats.BuildingsBuilt >= 3, "every bot should build houses and barracks");
        game.Players.Sum(p => p.Stats.Kills).Should().BeGreaterThan(0, "bot armies should meet and fight");
    }

    [Fact]
    public void BotMatch_SameSeed_PlaysIdentically()
    {
        var first = TestGames.Create(teams: 2, perTeam: 1, bots: true, seed: 11);
        var second = TestGames.Create(teams: 2, perTeam: 1, bots: true, seed: 11);

        TestGames.Run(first, TestGames.Seconds(4 * 60));
        TestGames.Run(second, TestGames.Seconds(4 * 60));

        Fingerprint(second).Should().Be(Fingerprint(first));
    }

    [Fact]
    public void BotMatch_HardAgainstEasy_HardWinsMostSeedsAndDestroysSome()
    {
        // Twelve seeds keep the win-rate gate steady; a short sample flips on a single seed.
        var seeds = Enumerable.Range(1, 12).ToList();
        var results = new (bool HardWon, bool Knockout, string Line)[seeds.Count];
        Parallel.For(0, seeds.Count, i =>
        {
            var seed = seeds[i];
            // Hard alternates seats, so it plays both races and both starting corners.
            var hardTeam = seed % 2;
            var game = hardTeam == 0
                ? TestGames.CreateDuel(BotDifficulty.Hard, BotDifficulty.Easy, seed)
                : TestGames.CreateDuel(BotDifficulty.Easy, BotDifficulty.Hard, seed);

            TestGames.Run(game, TestGames.Seconds(HorizonMinutes * 60));

            var knockout = game.IsOver;
            var hardWon = knockout ? game.WinningTeam == hardTeam : Score(game, hardTeam) > Score(game, 1 - hardTeam);
            results[i] = (hardWon, knockout, $"seed {seed}: {(hardWon ? "Hard" : "Easy")} won at {game.Tick / 600f:F1} min{(knockout ? " by destruction" : " on score")}");
        });
        foreach (var result in results)
        {
            _output.WriteLine(result.Line);
        }

        results.Count(r => r.HardWon).Should().BeGreaterThanOrEqualTo(9, "Hard should beat Easy in nearly every seed");
        results.Count(r => r.HardWon && r.Knockout).Should().BeGreaterThanOrEqualTo(6, "Hard should win most games outright, not only outscore Easy at the cap");
    }

    [Fact(Skip = "Brutal wins about 45% of 40 seeded duels against Hard; re-enable once bot hero combat is reworked and Brutal re-tuned.")]
    public void BotMatch_BrutalAgainstHard_BrutalWinsMostSeeds()
    {
        var seeds = Enumerable.Range(1, 20).ToList();
        var results = new (bool BrutalWon, string Line)[seeds.Count];
        Parallel.For(0, seeds.Count, i =>
        {
            var seed = seeds[i];
            // Brutal alternates seats, so it plays both races and both starting corners.
            var brutalTeam = seed % 2;
            var game = brutalTeam == 0
                ? TestGames.CreateDuel(BotDifficulty.Brutal, BotDifficulty.Hard, seed)
                : TestGames.CreateDuel(BotDifficulty.Hard, BotDifficulty.Brutal, seed);

            TestGames.Run(game, TestGames.Seconds(HorizonMinutes * 60));

            var knockout = game.IsOver;
            var brutalWon = knockout ? game.WinningTeam == brutalTeam : Score(game, brutalTeam) > Score(game, 1 - brutalTeam);
            results[i] = (brutalWon, $"seed {seed}: {(brutalWon ? "Brutal" : "Hard")} won at {game.Tick / 600f:F1} min{(knockout ? " by destruction" : " on score")} " +
                $"(Brutal {Score(game, brutalTeam)}, Hard {Score(game, 1 - brutalTeam)})");
        });
        foreach (var result in results)
        {
            _output.WriteLine(result.Line);
        }

        results.Count(r => r.BrutalWon).Should().BeGreaterThanOrEqualTo(11, "Brutal should beat Hard in most seeds");
    }

    [Fact]
    public void BotMatch_HardAgainstEasySameSeed_PlaysIdentically()
    {
        var first = TestGames.CreateDuel(BotDifficulty.Hard, BotDifficulty.Easy, seed: 5);
        var second = TestGames.CreateDuel(BotDifficulty.Hard, BotDifficulty.Easy, seed: 5);

        TestGames.Run(first, TestGames.Seconds(6 * 60));
        TestGames.Run(second, TestGames.Seconds(6 * 60));

        Fingerprint(second).Should().Be(Fingerprint(first));
    }

    [Fact]
    public void BotMatch_BrutalAgainstPassiveSameSeed_PlaysIdentically()
    {
        // Brutal's gather bonus and the passive bot's home-only plan both hold state between ticks, so replays must match.
        var first = TestGames.CreateDuel(BotDifficulty.Brutal, BotDifficulty.Passive, seed: 5);
        var second = TestGames.CreateDuel(BotDifficulty.Brutal, BotDifficulty.Passive, seed: 5);

        TestGames.Run(first, TestGames.Seconds(6 * 60));
        TestGames.Run(second, TestGames.Seconds(6 * 60));

        Fingerprint(second).Should().Be(Fingerprint(first));
    }

    private static int Score(Game game, int team)
    {
        return game.Players.Where(p => p.Team == team).Sum(p => p.Stats.Score);
    }

    private static string Fingerprint(Game game)
    {
        var units = string.Join(";", game.Entities.Units.Select(u => $"{u.Id}:{u.Position.X:F3},{u.Position.Y:F3},{u.Hp:F1}"));
        var stocks = string.Join(";", game.Players.Select(p => string.Join(",", p.Stock.Snapshot())));
        return $"{game.Tick}|{units}|{stocks}";
    }
}
