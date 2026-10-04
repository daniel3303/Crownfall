using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.UnitTests.Support;
using Crownfall.Sim.World;

namespace Crownfall.Sim.UnitTests.Systems;

public class WallSystemTests
{
    private const int Ring = 3;

    [Fact]
    public void Gate_LetsItsTeamThrough()
    {
        var (game, owner, center, _) = Enclosure();
        var resident = game.Spawn("spearman", owner, center);
        var outside = center + new Vector2(Ring + 3, 0);

        game.Issue(owner, new MoveCommand { Units = [resident.Id], X = outside.X, Y = outside.Y });
        TestGames.Run(game, TestGames.Seconds(10));

        Vector2.Distance(resident.Position, outside).Should().BeLessThan(0.5f);
    }

    [Fact]
    public void Walls_KeepOutEnemyVillagersAndCreeps()
    {
        var (game, _, center, walls) = Enclosure();
        var enemy = game.Players[1];
        var outside = center + new Vector2(Ring + 3, 0);
        var villager = game.Spawn("villager", enemy, game.Walkable(outside));
        var wolf = game.Spawn("wolf", null, game.Walkable(outside + new Vector2(0, 1)));
        game.Step([]);

        game.Issue(enemy, new MoveCommand { Units = [villager.Id], X = center.X, Y = center.Y });
        wolf.Order = UnitOrder.Move(center);
        TestGames.Run(game, TestGames.Seconds(15));

        InsideRing(villager.Position, center).Should().BeFalse();
        InsideRing(wolf.Position, center).Should().BeFalse();
        walls.Should().OnlyContain(w => w.Hp == w.MaxHp);
    }

    [Fact]
    public void EnemySoldiers_AttackMovingIn_BreakAWallAndGetInside()
    {
        var (game, _, center, walls) = Enclosure();
        var enemy = game.Players[1];
        foreach (var wall in walls)
        {
            wall.Hp = 25;
        }
        var soldier = game.Spawn("spearman", enemy, game.Walkable(center + new Vector2(Ring + 4, 1)));
        game.Step([]);

        game.Issue(enemy, new MoveCommand { Units = [soldier.Id], X = center.X, Y = center.Y, AttackMove = true });
        TestGames.Run(game, TestGames.Seconds(30));

        walls.Should().Contain(w => !w.IsAlive);
        InsideRing(soldier.Position, center).Should().BeTrue();
    }

    [Fact]
    public void Breach_AimsAtADamagedWallOverAnIntactOneNearby()
    {
        var (game, _, center, walls) = Enclosure();
        var damaged = walls.Single(w => w.Rect.X == (int)center.X + Ring && w.Rect.Y == (int)center.Y + 2);
        damaged.Hp = damaged.MaxHp * 0.1f;
        var from = center + new Vector2(Ring + 3, 0);

        game.Pathfinder.FindPath(from, center, team: 1, breach: true);

        game.Pathfinder.LastBreachWall.Should().Be(damaged.Id, "attackers converge on the wall already being broken");
    }

    [Fact]
    public void BuildLine_LaysEveryLineTile_ChargingEach_AndSkipsOwnWall()
    {
        var (game, player, spot, villager) = Builder();
        var existing = game.PlaceBuilding(game.Content.Building("wall"), player, TileRect.Single((int)spot.X + 2, (int)spot.Y + 1), complete: true);
        var stone = player.Stock[ResourceType.Stone];
        var (x1, y1, x2, y2) = ((int)spot.X, (int)spot.Y, (int)spot.X + 4, (int)spot.Y + 2);
        var line = TileLine.Between(x1, y1, x2, y2);

        game.Issue(player, new BuildLineCommand { Units = [villager.Id], Building = "wall", X1 = x1, Y1 = y1, X2 = x2, Y2 = y2 });

        var walls = line.Select(t => game.Entities.Get(game.Map.Occupant(t.X, t.Y))).OfType<Building>().ToList();
        walls.Should().HaveCount(line.Count).And.OnlyContain(w => w.Def.Id == "wall" && w.Owner == player);
        line.Should().Contain(((int)spot.X + 2, (int)spot.Y + 1));
        player.Stock[ResourceType.Stone].Should().Be(stone - (line.Count - 1) * game.Content.Building("wall").CostAmounts[(int)ResourceType.Stone]);
        existing.IsAlive.Should().BeTrue();
        villager.Order.Type.Should().Be(OrderType.Build);
    }

    [Fact]
    public void Build_InShallows_TakesWallsButNoOtherBuilding()
    {
        var (game, player, spot, villager) = Builder();
        var (x, y) = ((int)spot.X, (int)spot.Y);
        for (var dy = 0; dy < 2; dy++)
        {
            for (var dx = 0; dx < 3; dx++)
            {
                game.Map.SetTile(x + dx, y + dy, TileType.Shallow);
            }
        }

        game.Issue(player, new BuildCommand { Units = [villager.Id], Building = "house", X = x, Y = y });
        game.Issue(player, new BuildLineCommand { Units = [villager.Id], Building = "wall", X1 = x, Y1 = y, X2 = x + 2, Y2 = y });

        game.Entities.Buildings.Should().NotContain(b => b.Def.Id == "house" && b.Owner == player);
        Enumerable.Range(x, 3).Select(tx => game.Entities.Get(game.Map.Occupant(tx, y))).Should().OnlyContain(b => b is Building && ((Building)b).Def.Id == "wall");
    }

    [Fact]
    public void BuildLine_StopsAtTheFirstTileItCannotPayFor()
    {
        var (game, player, spot, villager) = Builder();
        player.Stock.TryTake(ResourceType.Stone, player.Stock[ResourceType.Stone] - 12);

        game.Issue(player, new BuildLineCommand { Units = [villager.Id], Building = "wall", X1 = (int)spot.X, Y1 = (int)spot.Y, X2 = (int)spot.X + 5, Y2 = (int)spot.Y });

        game.Entities.Buildings.Count(b => b.Owner == player && b.Def.Id == "wall").Should().Be(2);
        player.Stock[ResourceType.Stone].Should().Be(2);
    }

    [Fact]
    public void Gate_SetIntoOwnWall_ReplacesItForThePriceDifference()
    {
        var (game, player, spot, villager) = Builder();
        var tile = TileRect.Single((int)spot.X, (int)spot.Y);
        var wall = game.PlaceBuilding(game.Content.Building("wall"), player, tile, complete: true);
        var before = player.Stock.Snapshot();
        var gate = game.Content.Building("gate");

        game.Issue(player, new BuildCommand { Units = [villager.Id], Building = "gate", X = tile.X, Y = tile.Y });

        wall.IsRemoved.Should().BeTrue();
        game.Entities.Get(game.Map.Occupant(tile.X, tile.Y)).Should().BeOfType<Building>().Which.Def.Should().Be(gate);
        var stone = (int)ResourceType.Stone;
        player.Stock[ResourceType.Stone].Should().Be(before[stone] - (gate.CostAmounts[stone] - wall.Def.CostAmounts[stone]));
        player.Stock[ResourceType.Wood].Should().Be(before[(int)ResourceType.Wood] - gate.CostAmounts[(int)ResourceType.Wood]);
    }

    [Fact]
    public void Push_CannotSqueezeAUnitBetweenDiagonalWallTiles()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var spot = game.QuietSpot();
        var (sx, sy) = ((int)spot.X, (int)spot.Y);
        var wall = game.Content.Building("wall");
        game.PlaceBuilding(wall, game.Players[1], TileRect.Single(sx, sy), complete: true);
        game.PlaceBuilding(wall, game.Players[1], TileRect.Single(sx + 1, sy + 1), complete: true);
        var squeezed = game.Spawn("spearman", player, new Vector2(sx + 1.05f, sy + 0.95f));
        game.Spawn("spearman", player, new Vector2(sx + 1.2f, sy + 0.8f));

        game.Movement.Separate();

        ((int)MathF.Floor(squeezed.Position.X), (int)MathF.Floor(squeezed.Position.Y)).Should().Be((sx + 1, sy));
    }

    private static bool InsideRing(Vector2 point, Vector2 center)
    {
        return MathF.Abs(point.X - center.X) < Ring && MathF.Abs(point.Y - center.Y) < Ring;
    }

    /// <summary>A 7x7 ring of complete walls owned by player 0 around a quiet spot, with a gate on its east side.</summary>
    private static (Game Game, Player Owner, Vector2 Center, List<Building> Walls) Enclosure()
    {
        var game = TestGames.Create();
        var owner = game.Players[0];
        var spot = game.QuietSpot();
        var (cx, cy) = ((int)spot.X, (int)spot.Y);
        var walls = new List<Building>();
        for (var dy = -Ring; dy <= Ring; dy++)
        {
            for (var dx = -Ring; dx <= Ring; dx++)
            {
                if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != Ring)
                {
                    continue;
                }
                var id = dx == Ring && dy == 0 ? "gate" : "wall";
                walls.Add(game.PlaceBuilding(game.Content.Building(id), owner, TileRect.Single(cx + dx, cy + dy), complete: true));
            }
        }
        return (game, owner, new Vector2(cx + 0.5f, cy + 0.5f), walls);
    }

    private static (Game Game, Player Player, Vector2 Spot, Unit Villager) Builder()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var spot = game.QuietSpot();
        player.Stock.Add([500, 500, 500, 500]);
        var villager = game.Spawn("villager", player, game.Walkable(spot + new Vector2(0, 3)));
        game.Step([]);
        return (game, player, spot, villager);
    }
}
