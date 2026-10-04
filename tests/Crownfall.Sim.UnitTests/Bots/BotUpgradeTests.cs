using System.Numerics;
using Crownfall.Sim.Bots;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Bots;

/// <summary>Storage, market and raid habits of a Normal bot facing an idle seat.</summary>
public class BotUpgradeTests
{
    [Fact]
    public void Storage_NearTheCap_AddsAStorehouse()
    {
        var (game, bot) = BotGame();
        bot.Stock.Add(ResourceType.Wood, bot.Stock.Room(ResourceType.Wood) - 20);

        TestGames.Run(game, TestGames.Seconds(15));

        game.Entities.Buildings.Should().Contain(b => b.Owner == bot && b.Def.Id == "storehouse");
    }

    [Fact]
    public void Market_GoldAboutToOverflow_IsSpentOnResources()
    {
        var (game, bot) = BotGame();
        game.Place("storehouse", bot, BotBuilder.Toward(game.TownCenter(bot).Position, game.MapCenter, -7));
        bot.Stock.Add(ResourceType.Gold, bot.Stock.Room(ResourceType.Gold) - 10);
        var basePrices = (float[])bot.MarketPrices.Clone();

        TestGames.Run(game, TestGames.Seconds(10));

        bot.MarketPrices.Where((price, i) => price > basePrices[i]).Should().NotBeEmpty("buying raises the bot's own prices");
    }

    [Fact]
    public void Market_FoodAboutToOverflow_IsSold()
    {
        var (game, bot) = BotGame();
        game.Place("storehouse", bot, BotBuilder.Toward(game.TownCenter(bot).Position, game.MapCenter, -7));
        bot.Stock.Add(ResourceType.Food, bot.Stock.Room(ResourceType.Food) - 10);
        var gold = bot.Stock[ResourceType.Gold];

        TestGames.Run(game, TestGames.Seconds(3));

        bot.MarketPrices[(int)ResourceType.Food].Should().BeLessThan(game.Content.MarketBasePrices[(int)ResourceType.Food]);
        bot.Stock[ResourceType.Gold].Should().BeGreaterThan(gold);
    }

    [Fact]
    public void Raids_AnUnguardedEnemyStorehouseInSight_SendsAThief()
    {
        var (game, bot) = BotGame();
        var home = game.TownCenter(bot).Position;
        for (var i = 0; i < 12; i++)
        {
            game.Spawn("villager", bot, game.Walkable(home + new Vector2(-4 + i % 4, 4 + i / 4)));
        }
        var target = game.Place("storehouse", game.Players[1], BotBuilder.Toward(home, game.MapCenter, 10));

        TestGames.Run(game, TestGames.Seconds(25));

        game.UnitsOf(bot, "villager").Should().Contain(v => BotRaids.IsThief(v) && v.Order.Target == target
            || v.Order.Type == OrderType.ReturnCargo && v.Order.Resume != null && v.Order.Resume.Target == target);
    }

    private static (Game Game, Player Bot) BotGame()
    {
        var game = TestGames.Create(seed: 5);
        var bot = game.Players[0];
        TestGames.EnableBot(game, bot, BotDifficulty.Normal);
        return (game, bot);
    }
}
