using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
using Crownfall.Sim.UnitTests.Support;
using Crownfall.Sim.World;

namespace Crownfall.Sim.UnitTests.Systems;

public class ProductionSystemTests
{
    [Fact]
    public void Train_BesideShallows_StepsOutOntoDryGround()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        player.Stock.Add([2000, 2000, 2000, 2000]);
        var def = game.Content.Building("barracks");
        var spot = game.QuietSpot();
        var barracks = game.PlaceBuilding(def, player, new TileRect((int)spot.X, (int)spot.Y, def.Size, def.Size), complete: true);
        var ring = barracks.Rect.Inflate(1);
        var corners = new[] { (ring.X, ring.Y), (ring.X + ring.Width - 1, ring.Y), (ring.X, ring.Y + ring.Height - 1), (ring.X + ring.Width - 1, ring.Y + ring.Height - 1) };
        var dry = corners.MaxBy(c => Vector2.Distance(new Vector2(c.Item1 + 0.5f, c.Item2 + 0.5f), game.MapCenter));
        for (var y = ring.Y; y < ring.Y + ring.Height; y++)
        {
            for (var x = ring.X; x < ring.X + ring.Width; x++)
            {
                if (!barracks.Rect.Contains(x, y))
                {
                    game.Map.SetTile(x, y, (x, y) == dry ? TileType.Grass : TileType.Shallow);
                }
            }
        }
        var spearman = game.Content.Unit("spearman");

        game.Issue(player, new TrainCommand { Building = barracks.Id, Unit = spearman.Id });
        TestGames.Run(game, (int)MathF.Ceiling(game.Production.TrainSeconds(barracks, spearman) / game.Dt) + 2);

        var trained = game.UnitsOf(player, spearman.Id).Single();
        trained.Position.Should().Be(new Vector2(dry.Item1 + 0.5f, dry.Item2 + 0.5f), "the one dry tile beats shallows nearer the map center");
    }

    [Theory]
    [InlineData(0, "berserker")]
    [InlineData(1, "knight")]
    public void Train_AnotherRacesUniqueUnit_IsRefused(int seat, string unitId)
    {
        var (game, player, barracks) = Barracks(seat, level: 2);

        game.Issue(player, new TrainCommand { Building = barracks.Id, Unit = unitId });

        barracks.Queue.Should().BeEmpty();
    }

    [Theory]
    [InlineData(0, "knight")]
    [InlineData(1, "berserker")]
    public void Train_UniqueUnitAtALevelOneBarracks_IsRefusedWithTheReason(int seat, string unitId)
    {
        var (game, player, barracks) = Barracks(seat, level: 1);
        var stock = player.Stock.Snapshot();

        game.Issue(player, new TrainCommand { Building = barracks.Id, Unit = unitId });

        barracks.Queue.Should().BeEmpty();
        player.Stock.Snapshot().Should().Equal(stock, "a refused order costs nothing");
        game.Events.OfType<NoticeEvent>().Should().Contain(n => n.Player == player.Index && n.Text.Contains("level 2 Barracks"));
    }

    [Theory]
    [InlineData(0, "knight")]
    [InlineData(1, "berserker")]
    public void Train_UniqueUnitAtALevelTwoBarracks_JoinsTheArmy(int seat, string unitId)
    {
        var (game, player, barracks) = Barracks(seat, level: 2);
        var unit = game.Content.Unit(unitId);

        game.Issue(player, new TrainCommand { Building = barracks.Id, Unit = unitId });
        TestGames.Run(game, (int)MathF.Ceiling(game.Production.TrainSeconds(barracks, unit) / game.Dt) + 2);

        game.UnitsOf(player, unitId).Should().ContainSingle();
    }

    private static (Game Game, Player Player, Building Barracks) Barracks(int seat, int level)
    {
        var game = TestGames.Create();
        var player = game.Players[seat];
        player.Stock.Add([2000, 2000, 2000, 2000]);
        var def = game.Content.Building("barracks");
        var spot = game.QuietSpot();
        var barracks = game.PlaceBuilding(def, player, new TileRect((int)spot.X, (int)spot.Y, def.Size, def.Size), complete: true);
        barracks.Level = level;
        return (game, player, barracks);
    }
}
