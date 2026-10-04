using Crownfall.Server.Matches;
using Crownfall.Server.UnitTests.Support;
using Crownfall.Sim;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.World;

namespace Crownfall.Server.UnitTests.Matches;

public class MatchStatsRecorderTests
{
    private static readonly ContentDb Content = ContentDb.Load(RepoFiles.Path("content", "game.json"));

    [Fact]
    public void Observe_EveryTenSeconds_SamplesEveryPlayer()
    {
        var game = NewGame();
        var recorder = new MatchStatsRecorder(game);

        Run(game, recorder, seconds: 25);

        var timeline = recorder.Timeline();
        timeline.IntervalSeconds.Should().Be(10);
        timeline.Seconds.Should().Equal(0, 10, 20);
        timeline.Players.Should().HaveCount(2);
        timeline.Players.Should().OnlyContain(p => p.Army.Count == 3 && p.Gathered.Count == 3 && p.Score.Count == 3);
    }

    [Fact]
    public void Observe_GameOver_TakesOneFinalSampleAtTheEndTick()
    {
        var game = NewGame();
        var recorder = new MatchStatsRecorder(game);
        Run(game, recorder, seconds: 15);

        game.End(0);
        recorder.Observe(game);
        recorder.Observe(game);

        recorder.Timeline().Seconds.Should().Equal(0, 10, 15);
    }

    [Fact]
    public void Observe_GameOverWithinTheSampledSecond_ReplacesThatSampleWithTheFinalState()
    {
        var game = NewGame();
        var recorder = new MatchStatsRecorder(game);
        Run(game, recorder, seconds: 10);
        game.Step([]);
        recorder.Observe(game);
        game.Players[0].Stats.Gathered += 500;

        game.End(0);
        recorder.Observe(game);

        var timeline = recorder.Timeline();
        timeline.Seconds.Should().Equal(0, 10);
        timeline.Players.Should().OnlyContain(p => p.Army.Count == 2 && p.Gathered.Count == 2 && p.Score.Count == 2);
        timeline.Players[0].Gathered[^1].Should().Be(game.Players[0].Stats.Gathered, "the final sample holds the end state");
    }

    [Fact]
    public void Observe_Soldiers_CountsLivingSoldiersAsArmy()
    {
        var game = NewGame();
        var recorder = new MatchStatsRecorder(game);
        var player = game.Players[0];
        game.SpawnUnit(Content.Unit("spearman"), player, player.Start.Center);
        game.SpawnUnit(Content.Unit("archer"), player, player.Start.Center);

        Run(game, recorder, seconds: 10);

        var army = recorder.Timeline().Players[0].Army;
        army[0].Should().Be(0, "a match opens with villagers and a hero only");
        army[^1].Should().Be(2);
    }

    [Fact]
    public void Observe_HeroSlainByAnEnemy_CreditsTheSlayerAndTheFallen()
    {
        var game = NewGame();
        var recorder = new MatchStatsRecorder(game);
        game.Step([]);

        game.Kill(game.Players[1].Hero, game.Players[0]);
        recorder.Observe(game);

        recorder.Tally(0).HeroKills.Should().Be(1);
        recorder.Tally(1).HeroDeaths.Should().Be(1);
        recorder.Tally(1).HeroKills.Should().Be(0);
        recorder.Tally(0).HeroDeaths.Should().Be(0);
    }

    [Fact]
    public void Observe_HeroFelledByCreeps_CountsTheDeathAndCreditsNobody()
    {
        var game = NewGame();
        var recorder = new MatchStatsRecorder(game);
        game.Step([]);

        game.Kill(game.Players[1].Hero, null);
        recorder.Observe(game);

        recorder.Tally(1).HeroDeaths.Should().Be(1);
        recorder.Tally(0).HeroKills.Should().Be(0);
    }

    [Fact]
    public void Observe_SameTickTwice_CountsItsEventsOnce()
    {
        var game = NewGame();
        var recorder = new MatchStatsRecorder(game);
        game.Step([]);
        game.Kill(game.Players[1].Hero, game.Players[0]);

        recorder.Observe(game);
        recorder.Observe(game);

        recorder.Tally(0).HeroKills.Should().Be(1);
    }

    [Fact]
    public void Observe_TrainingAtBarracksAndTownCenter_CountsOnlySoldiers()
    {
        var game = NewGame();
        var recorder = new MatchStatsRecorder(game);
        var player = game.Players[0];
        player.Stock.Add([1000, 1000, 1000, 1000]);
        game.PlaceBuilding(Content.Building("house"), player, FreeRect(game, player, Content.Building("house").Size), complete: true);
        var barracks = game.PlaceBuilding(Content.Building("barracks"), player, FreeRect(game, player, Content.Building("barracks").Size), complete: true);
        var townCenter = game.Entities.Buildings.First(b => b.Owner == player && b.Def.IsTownCenter);

        game.Step([
            new CommandEnvelope(player.Index, new TrainCommand { Building = barracks.Id, Unit = "spearman" }),
            new CommandEnvelope(player.Index, new TrainCommand { Building = townCenter.Id, Unit = "villager" }),
        ]);
        recorder.Observe(game);
        Run(game, recorder, seconds: 60);

        player.Stats.UnitsTrained.Should().Be(2);
        recorder.Tally(0).SoldiersTrained.Should().Be(1);
    }

    private static Game NewGame()
    {
        var config = new MatchConfig { Teams = 2, PlayersPerTeam = 1, MapSize = MapSize.Small, Seed = 9 };
        var seats = new List<PlayerSetup>
        {
            new() { Name = "Ana", Team = 0, Race = "humans" },
            new() { Name = "Bo", Team = 1, Race = "orcs" },
        };
        return new Game(Content, config, seats);
    }

    private static void Run(Game game, MatchStatsRecorder recorder, int seconds)
    {
        for (var i = 0; i < seconds * Content.Rules.TickRate; i++)
        {
            game.Step([]);
            recorder.Observe(game);
        }
    }

    /// <summary>The first buildable square scanning outward from the player's start.</summary>
    private static TileRect FreeRect(Game game, Player player, int size)
    {
        var center = player.Start.Center;
        for (var ring = 4; ring < 30; ring++)
        {
            for (var dy = -ring; dy <= ring; dy++)
            {
                for (var dx = -ring; dx <= ring; dx++)
                {
                    var rect = new TileRect((int)center.X + dx, (int)center.Y + dy, size, size);
                    if (game.Map.IsBuildable(rect))
                    {
                        return rect;
                    }
                }
            }
        }
        throw new InvalidOperationException("No room to build near the start.");
    }
}
