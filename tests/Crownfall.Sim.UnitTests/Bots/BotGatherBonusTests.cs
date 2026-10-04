using Crownfall.Sim.Bots;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Bots;

/// <summary>Brutal's economy bonus: a share of its own deposits, paid in whole units with the fractions carried.</summary>
public class BotGatherBonusTests
{
    [Fact]
    public void Witness_BrutalOwnDeposits_BanksThirtyPercentAndCarriesTheFraction()
    {
        var game = TestGames.Create();
        var bot = game.Players[1];
        bot.BotDifficulty = BotDifficulty.Brutal;
        var controller = new BotController(game, bot);
        var before = bot.Stock[ResourceType.Wood];

        controller.Witness([Deposit(bot, 10), Deposit(bot, 5), Deposit(game.Players[0], 100)]);
        var afterFirst = bot.Stock[ResourceType.Wood];
        controller.Witness([Deposit(bot, 5)]);

        afterFirst.Should().Be(before + 4, "30% of the bot's own 15 wood is 4.5, and the rival's deposit pays nothing");
        bot.Stock[ResourceType.Wood].Should().Be(before + 6, "the carried half joins the next 1.5");
    }

    [Fact]
    public void Witness_HardOwnDeposits_BanksNothingExtra()
    {
        var game = TestGames.Create();
        var bot = game.Players[1];
        bot.BotDifficulty = BotDifficulty.Hard;
        var controller = new BotController(game, bot);
        var before = bot.Stock[ResourceType.Wood];

        controller.Witness([Deposit(bot, 50)]);

        bot.Stock[ResourceType.Wood].Should().Be(before);
    }

    private static DepositEvent Deposit(Player player, int amount)
    {
        return new DepositEvent { Player = player.Index, X = player.Start.Center.X, Y = player.Start.Center.Y, Resource = ResourceType.Wood, Amount = amount };
    }
}
