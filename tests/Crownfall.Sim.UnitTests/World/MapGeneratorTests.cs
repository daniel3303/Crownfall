using System.Numerics;
using Crownfall.Sim.Core;
using Crownfall.Sim.UnitTests.Support;
using Crownfall.Sim.World;

namespace Crownfall.Sim.UnitTests.World;

public class MapGeneratorTests
{
    [Theory]
    [InlineData(2, 1, MapSize.Small, 1)]
    [InlineData(2, 4, MapSize.Medium, 2)]
    [InlineData(4, 4, MapSize.Large, 3)]
    [InlineData(3, 2, MapSize.Small, 4)]
    public void Generate_EveryStartCanReachEveryOtherStart(int teams, int perTeam, MapSize size, int seed)
    {
        var game = TestGames.Create(teams: teams, perTeam: perTeam, size: size, seed: seed);
        var origin = game.Players[0].Start;

        foreach (var player in game.Players.Skip(1))
        {
            var path = game.Pathfinder.FindPathToRect(origin.Center + new Vector2(0, 3), player.Start.TownCenter);
            path.Should().NotBeEmpty();
            player.Start.TownCenter.DistanceTo(path[^1]).Should().BeLessThan(1.5f, $"player {player.Index} must be reachable");
        }
    }

    [Theory]
    [InlineData(5)]
    [InlineData(6)]
    [InlineData(7)]
    public void Generate_EveryStartHasItsOwnResources(int seed)
    {
        var game = TestGames.Create(teams: 2, perTeam: 2, size: MapSize.Medium, seed: seed);

        foreach (var player in game.Players)
        {
            var center = player.Start.Center;
            game.Entities.Nodes.Should().Contain(n => n.Def.Id == "goldMine" && n.Rect.DistanceTo(center) < 12, $"seat {player.Index} needs gold");
            game.Entities.Nodes.Should().Contain(n => n.Def.Id == "stoneMine" && n.Rect.DistanceTo(center) < 13, $"seat {player.Index} needs stone");
            game.Entities.Nodes.Count(n => n.Def.Id == "berries" && n.Rect.DistanceTo(center) < 10).Should().BeGreaterThanOrEqualTo(4);
            game.Finder.TryFindNearestTree(center, 15, out _, out _).Should().BeTrue($"seat {player.Index} needs wood");
        }
    }

    [Theory]
    [InlineData(MapSize.Small, 1)]
    [InlineData(MapSize.Medium, 2)]
    [InlineData(MapSize.Large, 3)]
    public void Generate_LakesHaveAWadeableRimThatHoldsNothing(MapSize size, int seed)
    {
        var game = TestGames.Create(teams: 2, perTeam: 2, size: size, seed: seed);
        var map = game.Map;
        var shallows = new List<(int X, int Y)>();
        for (var y = 0; y < map.Height; y++)
        {
            for (var x = 0; x < map.Width; x++)
            {
                if (map.Tile(x, y) == TileType.Shallow)
                {
                    shallows.Add((x, y));
                }
            }
        }

        shallows.Should().NotBeEmpty();
        shallows.Should().OnlyContain(t => map.IsWalkable(t.X, t.Y) && !map.IsBuildable(t.X, t.Y));
        shallows.Should().OnlyContain(t => LandNeighbors(map, t.X, t.Y) > 0, "only the rim of a lake is shallow");
        game.Entities.Nodes.Should().OnlyContain(n => Tiles(n.Rect).All(t => map.Tile(t.X, t.Y) != TileType.Shallow));
        game.Players.Should().OnlyContain(p => Tiles(p.Start.TownCenter).All(t => map.Tile(t.X, t.Y) != TileType.Shallow));
    }

    [Theory]
    [InlineData(MapSize.Small, 1)]
    [InlineData(MapSize.Medium, 2)]
    public void Generate_EveryShallowHasOpenWaterBehindIt(MapSize size, int seed)
    {
        var game = TestGames.Create(size: size, seed: seed);
        var map = game.Map;

        for (var y = 1; y < map.Height - 1; y++)
        {
            for (var x = 1; x < map.Width - 1; x++)
            {
                if (map.Tile(x, y) == TileType.Shallow)
                {
                    HasDeepWaterBehind(map, x, y).Should().BeTrue($"the shallow at {x},{y} must have open water behind it");
                }
            }
        }
    }

    [Theory]
    [InlineData(2, 1, MapSize.Small, 1)]
    [InlineData(2, 1, MapSize.Small, 7)]
    [InlineData(2, 2, MapSize.Medium, 2)]
    [InlineData(4, 4, MapSize.Large, 3)]
    public void Generate_WadingNeverReachesDryGroundThatWalkingCannot(int teams, int perTeam, MapSize size, int seed)
    {
        var game = TestGames.Create(teams: teams, perTeam: perTeam, size: size, seed: seed);
        var map = game.Map;
        var start = game.Players[0].Start.TownCenter;
        var from = (start.X, start.Y + start.Height + 1);

        var walking = Flood(map, from, wade: false);
        var wading = Flood(map, from, wade: true);

        var dryByWading = wading.Where(t => GameMap.IsBuildableTerrain(map.Tile(t.X, t.Y))).ToHashSet();
        dryByWading.Should().BeEquivalentTo(walking, "shallows may shorten routes but never open land a dry walk cannot reach");
    }

    /// <summary>Tiles reachable from a start over dry ground, or also over shallows when <paramref name="wade"/> is set.</summary>
    private static HashSet<(int X, int Y)> Flood(GameMap map, (int X, int Y) from, bool wade)
    {
        var reached = new HashSet<(int X, int Y)> { from };
        var queue = new Queue<(int X, int Y)>([from]);
        while (queue.Count > 0)
        {
            var (x, y) = queue.Dequeue();
            foreach (var (dx, dy) in new[] { (1, 0), (-1, 0), (0, 1), (0, -1) })
            {
                var next = (x + dx, y + dy);
                if (!map.InBounds(next.Item1, next.Item2) || reached.Contains(next))
                {
                    continue;
                }
                var tile = map.Tile(next.Item1, next.Item2);
                if (GameMap.IsBuildableTerrain(tile) || wade && tile == TileType.Shallow)
                {
                    reached.Add(next);
                    queue.Enqueue(next);
                }
            }
        }
        return reached;
    }

    private static bool HasDeepWaterBehind(GameMap map, int x, int y)
    {
        for (var dy = -1; dy <= 1; dy++)
        {
            for (var dx = -1; dx <= 1; dx++)
            {
                if (map.Tile(x + dx, y + dy) == TileType.Water && DryNeighbors(map, x + dx, y + dy) == 0)
                {
                    return true;
                }
            }
        }
        return false;
    }

    private static int DryNeighbors(GameMap map, int x, int y)
    {
        var dry = 0;
        for (var dy = -1; dy <= 1; dy++)
        {
            for (var dx = -1; dx <= 1; dx++)
            {
                if (map.InBounds(x + dx, y + dy) && GameMap.IsBuildableTerrain(map.Tile(x + dx, y + dy)))
                {
                    dry++;
                }
            }
        }
        return dry;
    }

    /// <summary>Neighbours that are land of any kind; forest planted after the shores were laid still counts.</summary>
    private static int LandNeighbors(GameMap map, int x, int y)
    {
        var land = 0;
        for (var dy = -1; dy <= 1; dy++)
        {
            for (var dx = -1; dx <= 1; dx++)
            {
                if (map.InBounds(x + dx, y + dy) && map.Tile(x + dx, y + dy) is not (TileType.Water or TileType.Shallow))
                {
                    land++;
                }
            }
        }
        return land;
    }

    private static IEnumerable<(int X, int Y)> Tiles(TileRect rect)
    {
        for (var y = rect.Y; y < rect.Y + rect.Height; y++)
        {
            for (var x = rect.X; x < rect.X + rect.Width; x++)
            {
                yield return (x, y);
            }
        }
    }

    [Fact]
    public void Generate_SameSeed_ProducesSameTiles()
    {
        var first = TestGames.Create(seed: 99);
        var second = TestGames.Create(seed: 99);

        second.Map.TileBytes().Should().Equal(first.Map.TileBytes());
    }
}
