using Crownfall.Server.Protocol;
using Crownfall.Server.UnitTests.Support;
using Crownfall.Sim;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Crownfall.Server.UnitTests.Protocol;

/// <summary>
/// Writes a seeded mid-game snapshot, the tile map and the server's visible-tile bitmap for team 0, so the client's
/// vision test can prove it stamps fog, trees blocking line of sight, exactly like VisionSystem.
/// </summary>
public class VisionFixtureTests
{
    private const int Ticks = 900;
    private const int ViewerTeam = 0;

    [Fact]
    public void Encode_SeededBotGame_MatchesCommittedVisionFixture()
    {
        var content = ContentDb.Load(RepoFiles.Path("content", "game.json"));
        var game = new Game(content, Config(), Seats());
        for (var i = 0; i < Ticks; i++)
        {
            game.Step([]);
        }
        var viewer = game.Players.First(p => p.Team == ViewerTeam);
        var visible = new byte[game.Map.Width * game.Map.Height];
        for (var y = 0; y < game.Map.Height; y++)
        {
            for (var x = 0; x < game.Map.Width; x++)
            {
                visible[y * game.Map.Width + x] = (byte)(game.Vision.IsTileVisible(ViewerTeam, x, y) ? 1 : 0);
            }
        }
        var fixture = new JObject
        {
            ["width"] = game.Map.Width,
            ["height"] = game.Map.Height,
            ["team"] = ViewerTeam,
            ["playerTeams"] = new JArray(game.Players.Select(p => p.Team)),
            ["tiles"] = Convert.ToBase64String(game.Map.TileBytes()),
            ["snapshot"] = Convert.ToBase64String(SnapshotEncoder.Encode(game, viewer)),
            ["visible"] = Convert.ToBase64String(visible),
        }.ToString(Formatting.Indented);

        var path = RepoFiles.Path("protocol", "fixtures", "vision-v2.json");
        if (Environment.GetEnvironmentVariable("CROWNFALL_UPDATE_FIXTURES") == "1")
        {
            File.WriteAllText(path, fixture);
        }
        fixture.Should().Be(File.ReadAllText(path), "regenerate with CROWNFALL_UPDATE_FIXTURES=1 after a simulation change");
        visible.Should().Contain(1).And.Contain(0);
    }

    private static MatchConfig Config()
    {
        return new MatchConfig { Teams = 2, PlayersPerTeam = 2, Seed = 1234, MapSize = MapSize.Small };
    }

    private static List<PlayerSetup> Seats()
    {
        return Enumerable.Range(0, 4)
            .Select(i => new PlayerSetup { Name = $"Bot {i}", Team = i / 2, Race = i % 2 == 0 ? "humans" : "orcs", IsBot = true })
            .ToList();
    }
}
