using System.Numerics;
using Crownfall.Sim.Commands;
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
}
