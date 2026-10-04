using System.Numerics;
using Crownfall.Sim.Bots;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.UnitTests.Support;
using Crownfall.Sim.World;

namespace Crownfall.Sim.UnitTests.Bots;

public class BotWallTests
{
    private const int ArmySize = 12;

    [Fact]
    public void BotArmy_AtAWalledTownCenter_BreaksThroughTheWall()
    {
        var game = TestGames.Create(seed: 6);
        var bot = game.Players[0];
        var enemy = game.Players[1];
        var target = game.TownCenter(enemy);
        var walls = WallIn(game, enemy, target.Rect.Inflate(2));
        var approach = BotBuilder.Toward(target.Position, game.TownCenter(bot).Position, 9);
        for (var i = 0; i < ArmySize; i++)
        {
            game.Spawn("spearman", bot, game.Walkable(approach + new Vector2(i % 5 - 2, i / 5 - 2)));
        }
        // This test covers the breach alone: creeps would draw the army off its target, and the enemy hero would chase it home.
        foreach (var creep in game.Entities.Units.Where(u => u.Owner == null).ToList())
        {
            game.Kill(creep, null);
        }
        game.Kill(enemy.Hero, null);
        TestGames.EnableBot(game, bot, BotDifficulty.Hard);

        TestGames.Run(game, TestGames.Seconds(120));

        walls.Should().Contain(w => !w.IsAlive, "soldiers sent at a walled town center should break a wall rather than idle outside");
        target.Hp.Should().BeLessThan(target.MaxHp, "the army should get through the gap to the town center");
    }

    [Fact]
    public void BotArmy_AtAWalledTownCenterGuardedByAFirstLevelHero_BeatsTheHeroInsteadOfFleeingIt()
    {
        var game = TestGames.Create(seed: 6);
        var bot = game.Players[0];
        var enemy = game.Players[1];
        var target = game.TownCenter(enemy);
        WallIn(game, enemy, target.Rect.Inflate(2));
        var approach = BotBuilder.Toward(target.Position, game.TownCenter(bot).Position, 9);
        for (var i = 0; i < ArmySize; i++)
        {
            game.Spawn("spearman", bot, game.Walkable(approach + new Vector2(i % 5 - 2, i / 5 - 2)));
        }
        foreach (var creep in game.Entities.Units.Where(u => u.Owner == null).ToList())
        {
            game.Kill(creep, null);
        }
        TestGames.EnableBot(game, bot, BotDifficulty.Hard);

        for (var tick = 0; tick < TestGames.Seconds(120) && enemy.Hero != null; tick++)
        {
            game.Step([]);
        }

        enemy.Hero.Should().BeNull("a full wave should beat a lone first level hero rather than retreat and be chased home");
        game.UnitsOf(bot, "spearman").Count.Should().BeGreaterThanOrEqualTo(ArmySize / 2);
    }

    /// <summary>A ring of complete walls on every buildable tile of the rectangle's border.</summary>
    private static List<Building> WallIn(Game game, Player owner, TileRect ring)
    {
        var def = game.Content.Building("wall");
        var walls = new List<Building>();
        for (var y = ring.Y; y < ring.Y + ring.Height; y++)
        {
            for (var x = ring.X; x < ring.X + ring.Width; x++)
            {
                var border = x == ring.X || y == ring.Y || x == ring.X + ring.Width - 1 || y == ring.Y + ring.Height - 1;
                if (border && game.Map.IsBuildable(TileRect.Single(x, y)))
                {
                    walls.Add(game.PlaceBuilding(def, owner, TileRect.Single(x, y), complete: true));
                }
            }
        }
        return walls;
    }
}
