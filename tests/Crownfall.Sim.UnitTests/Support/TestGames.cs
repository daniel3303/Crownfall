using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.UnitTests.Support;

internal static class TestGames
{
    public static readonly ContentDb Content = ContentDb.Load(ContentDb.FindDefaultPath());

    public static Game Create(
        int teams = 2,
        int perTeam = 1,
        bool bots = false,
        int seed = 42,
        MapSize size = MapSize.Small,
        ResourceSharing sharing = ResourceSharing.SeparateWithTribute,
        BotDifficulty difficulty = BotDifficulty.Normal)
    {
        var config = new MatchConfig
        {
            Teams = teams,
            PlayersPerTeam = perTeam,
            Seed = seed,
            MapSize = size,
            Sharing = sharing,
            Difficulty = difficulty,
        };
        var seats = new List<PlayerSetup>();
        for (var team = 0; team < teams; team++)
        {
            for (var slot = 0; slot < perTeam; slot++)
            {
                seats.Add(new PlayerSetup
                {
                    Name = $"P{team}-{slot}",
                    Team = team,
                    Race = (team + slot) % 2 == 0 ? "humans" : "orcs",
                    IsBot = bots,
                });
            }
        }
        return new Game(Content, config, seats);
    }

    /// <summary>A one-versus-one bot match on a small map with its own difficulty per seat.</summary>
    public static Game CreateDuel(BotDifficulty first, BotDifficulty second, int seed)
    {
        var game = Create(seed: seed);
        EnableBot(game, game.Players[0], first);
        EnableBot(game, game.Players[1], second);
        return game;
    }

    /// <summary>Hands a seat to a bot; the bot reads the seat's difficulty when it takes over.</summary>
    public static void EnableBot(Game game, Player player, BotDifficulty difficulty)
    {
        player.BotDifficulty = difficulty;
        game.SetBotControl(player, true, player.Name);
    }

    public static void Run(Game game, int ticks)
    {
        for (var i = 0; i < ticks && !game.IsOver; i++)
        {
            game.Step([]);
        }
    }

    public static int Seconds(float seconds)
    {
        return (int)(seconds * Content.Rules.TickRate);
    }
}
