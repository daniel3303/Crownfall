using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Systems;

public class MarketSystemTests
{
    private static Crownfall.Sim.Content.MarketDef Market => TestGames.Content.Rules.Market;

    [Fact]
    public void Buy_PaysTheBuyPrice_AddsALot_AndRaisesThePrice()
    {
        var (game, player, store) = Trader();
        var price = game.Market.BuyPrice(player, ResourceType.Food);
        var (food, gold) = (player.Stock[ResourceType.Food], player.Stock[ResourceType.Gold]);

        game.Commands.Apply(player, Trade(store, ResourceType.Food, buy: true));

        player.Stock[ResourceType.Food].Should().Be(food + Market.Lot);
        player.Stock[ResourceType.Gold].Should().Be(gold - price);
        game.Market.BuyPrice(player, ResourceType.Food).Should().BeGreaterThan(price);
    }

    [Fact]
    public void Sell_EarnsTheSellPrice_AndLowersThePrice()
    {
        var (game, player, store) = Trader();
        var price = game.Market.SellPrice(player, ResourceType.Wood);
        var (wood, gold) = (player.Stock[ResourceType.Wood], player.Stock[ResourceType.Gold]);

        game.Commands.Apply(player, Trade(store, ResourceType.Wood, buy: false));

        player.Stock[ResourceType.Wood].Should().Be(wood - Market.Lot);
        player.Stock[ResourceType.Gold].Should().Be(gold + price);
        game.Market.SellPrice(player, ResourceType.Wood).Should().BeLessThan(price);
    }

    [Fact]
    public void BuyingThenSelling_LosesGold()
    {
        var (game, player, store) = Trader();
        var gold = player.Stock[ResourceType.Gold];

        game.Commands.Apply(player, Trade(store, ResourceType.Stone, buy: true));
        game.Commands.Apply(player, Trade(store, ResourceType.Stone, buy: false));

        player.Stock[ResourceType.Gold].Should().BeLessThan(gold);
    }

    [Fact]
    public void Prices_DriftBackToTheirBase()
    {
        var (game, player, store) = Trader();
        var basePrice = game.Market.BuyPrice(player, ResourceType.Food);
        for (var i = 0; i < 3; i++)
        {
            game.Commands.Apply(player, Trade(store, ResourceType.Food, buy: true));
        }
        var seconds = 3 * Market.Step / Market.DriftPerSecond;

        TestGames.Run(game, TestGames.Seconds(seconds) + 2);

        game.Market.BuyPrice(player, ResourceType.Food).Should().Be(basePrice);
    }

    [Fact]
    public void Buy_WithoutStorageRoom_IsRefusedAndChargesNothing()
    {
        var (game, player, store) = Trader();
        player.Stock.Add(ResourceType.Food, player.Stock.Room(ResourceType.Food) - Market.Lot + 1);
        var before = player.Stock.Snapshot();

        game.Commands.Apply(player, Trade(store, ResourceType.Food, buy: true));

        player.Stock.Snapshot().Should().Equal(before);
    }

    [Fact]
    public void Trades_WithoutFunds_OrAwayFromAnOwnMarket_DoNothing()
    {
        var (game, player, store) = Trader();
        var enemyStore = game.Place("storehouse", game.Players[1], game.QuietSpot());
        var house = game.Place("house", player, game.QuietSpot());
        player.Stock.TryTake(ResourceType.Gold, player.Stock[ResourceType.Gold]);
        player.Stock.TryTake(ResourceType.Wood, player.Stock[ResourceType.Wood]);
        var before = player.Stock.Snapshot();

        game.Commands.Apply(player, Trade(store, ResourceType.Food, buy: true));
        game.Commands.Apply(player, Trade(store, ResourceType.Wood, buy: false));
        game.Commands.Apply(player, Trade(store, ResourceType.Gold, buy: false));
        game.Commands.Apply(player, Trade(enemyStore, ResourceType.Food, buy: false));
        game.Commands.Apply(player, Trade(house, ResourceType.Food, buy: false));

        player.Stock.Snapshot().Should().Equal(before);
    }

    private static TradeCommand Trade(Building building, ResourceType resource, bool buy)
    {
        return new TradeCommand { Building = building.Id, Resource = resource, Buy = buy };
    }

    private static (Game Game, Player Player, Building Store) Trader()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var store = game.Place("storehouse", player, game.QuietSpot());
        player.Stock.Add([300, 300, 300, 400]);
        return (game, player, store);
    }
}
