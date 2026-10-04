using System.Numerics;
using Crownfall.Sim.UnitTests.Support;
using Crownfall.Sim.World;

namespace Crownfall.Sim.UnitTests.Pathfinding;

public class PathfinderTests
{
    [Fact]
    public void FindPath_PastAShallowPatchItWalksAround_NeverSmoothsAcrossIt()
    {
        var game = TestGames.Create();
        var spot = game.QuietSpot();
        var (x0, y0) = ((int)spot.X, (int)spot.Y);
        for (var y = y0 - 3; y <= y0 + 3; y++)
        {
            for (var x = x0 - 1; x <= x0 + 11; x++)
            {
                game.Map.SetTile(x, y, TileType.Grass);
            }
        }
        // Wading the two tiles costs more than stepping one row aside, so the search walks around them.
        game.Map.SetTile(x0 + 4, y0, TileType.Shallow);
        game.Map.SetTile(x0 + 5, y0, TileType.Shallow);
        var from = new Vector2(x0 + 0.5f, y0 + 0.5f);

        var path = game.Pathfinder.FindPath(from, new Vector2(x0 + 9.5f, y0 + 0.5f));

        path.Should().NotBeEmpty();
        var corners = path.Prepend(from).ToList();
        for (var i = 1; i < corners.Count; i++)
        {
            for (var t = 0f; t <= 1f; t += 0.05f)
            {
                var point = Vector2.Lerp(corners[i - 1], corners[i], t);
                game.Map.IsShallow((int)MathF.Floor(point.X), (int)MathF.Floor(point.Y)).Should().BeFalse($"segment {i} crosses shallows at {point}");
            }
        }
    }
}
