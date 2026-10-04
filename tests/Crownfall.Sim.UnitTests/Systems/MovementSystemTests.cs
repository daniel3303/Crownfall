using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Systems;
using Crownfall.Sim.UnitTests.Support;
using Crownfall.Sim.World;

namespace Crownfall.Sim.UnitTests.Systems;

public class MovementSystemTests
{
    private const int Ticks = 5;

    [Fact]
    public void Move_ThroughShallows_WadesAtReducedSpeed()
    {
        var game = TestGames.Create(size: MapSize.Medium, seed: 2);
        var player = game.Players[0];
        var (x, y) = ShallowRun(game.Map);
        var wader = game.Spawn("spearman", player, new Vector2(x + 0.5f, y + 0.5f));
        var start = wader.Position;

        game.Issue(player, new MoveCommand { Units = [wader.Id], X = x + 2.5f, Y = y + 0.5f });
        TestGames.Run(game, Ticks - 1);

        var expected = wader.Def.Speed * MovementSystem.WadeSpeed * Ticks * game.Dt;
        Vector2.Distance(start, wader.Position).Should().BeApproximately(expected, expected * 0.15f);
    }

    /// <summary>The west end of three shallow tiles in a row, so a short eastward walk stays in the water.</summary>
    private static (int X, int Y) ShallowRun(GameMap map)
    {
        for (var y = 0; y < map.Height; y++)
        {
            for (var x = 0; x < map.Width - 2; x++)
            {
                if (map.IsShallow(x, y) && map.IsShallow(x + 1, y) && map.IsShallow(x + 2, y))
                {
                    return (x, y);
                }
            }
        }
        throw new InvalidOperationException("No straight run of shallows on this map.");
    }
}
