using System.Numerics;
using Crownfall.Sim.Bots;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Bots;

/// <summary>How a bot outfits its hero: a fixed build within the profile's budget, bought at home above the reserve.</summary>
public class BotHeroUpgradesTests
{
    private const int GoldReserve = 50;

    [Fact]
    public void Items_GoldAboveTheReserve_BuysTheFirstBuildItemAndKeepsTheReserve()
    {
        var (game, bot) = Seat();
        var sword = Item(game, "ironSword");
        SetGold(bot, Gold(sword) + GoldReserve);

        var upgrades = Run(game, bot, BotDifficulty.Normal);

        bot.HeroState.Items[0].Should().BeSameAs(sword);
        bot.Stock[ResourceType.Gold].Should().Be(GoldReserve);
        upgrades.WantsShop.Should().BeFalse();
    }

    [Fact]
    public void Items_PriceReachingIntoTheReserve_WaitsForMoreGold()
    {
        var (game, bot) = Seat();
        SetGold(bot, Gold(Item(game, "ironSword")) + GoldReserve - 1);

        var upgrades = Run(game, bot, BotDifficulty.Normal);

        bot.HeroState.Items.Should().OnlyContain(i => i == null);
        upgrades.WantsShop.Should().BeFalse("nothing is affordable yet, so the hero has no reason to walk home");
    }

    [Fact]
    public void Items_HeroAwayFromHome_AsksToGoShoppingInsteadOfBuying()
    {
        var (game, bot) = Seat();
        SetGold(bot, 5000);
        bot.Hero.Position = game.QuietSpot();

        var upgrades = Run(game, bot, BotDifficulty.Normal);

        bot.HeroState.Items.Should().OnlyContain(i => i == null);
        upgrades.WantsShop.Should().BeTrue();
    }

    [Fact]
    public void Items_EachProfile_StopsTheBuildAtItsBudget()
    {
        var bought = new Dictionary<BotDifficulty, List<string>>();
        foreach (var difficulty in new[] { BotDifficulty.Easy, BotDifficulty.Normal, BotDifficulty.Hard })
        {
            var (game, bot) = Seat();
            for (var i = 0; i < 10; i++)
            {
                SetGold(bot, 5000);
                bot.Stock.Add(ResourceType.Stone, 500);
                Run(game, bot, difficulty);
            }
            bought[difficulty] = bot.HeroState.Items.Where(i => i != null).Select(i => i.Id).ToList();
        }

        bought[BotDifficulty.Easy].Should().Equal("ironSword", "vitalityCharm", "leatherArmor");
        bought[BotDifficulty.Normal].Should().Equal("ironSword", "vitalityCharm", "leatherArmor", "vampireFang", "hasteGloves");
        bought[BotDifficulty.Hard].Should().Equal("warlordBlade", "vitalityCharm", "leatherArmor", "vampireFang", "hasteGloves", "plateArmor");
    }

    [Fact]
    public void Items_LateUpgrade_SellsTheSwordForTheBladeWithTheRefundCounted()
    {
        var (game, bot) = Seat();
        var hard = BotProfile.For(BotDifficulty.Hard);
        foreach (var id in new[] { "ironSword", "vitalityCharm", "leatherArmor", "vampireFang", "hasteGloves", "plateArmor" })
        {
            bot.HeroState.Items[Array.IndexOf(bot.HeroState.Items, null)] = Item(game, id);
        }
        var blade = Item(game, "warlordBlade");
        var refund = game.Shop.SellPrice(Item(game, "ironSword"))[(int)ResourceType.Gold];
        SetGold(bot, Gold(blade) - refund + GoldReserve);

        Run(game, bot, BotDifficulty.Hard);

        hard.ItemBudget.Should().BeGreaterThanOrEqualTo(Gold(blade));
        bot.HeroState.Items[0].Should().BeSameAs(blade);
        bot.Stock[ResourceType.Gold].Should().Be(GoldReserve);
    }

    [Fact]
    public void Items_ABotHeroFarFromHome_WalksBackToBuyThem()
    {
        var game = TestGames.Create(seed: 5);
        var bot = game.Players[0];
        TestGames.EnableBot(game, bot, BotDifficulty.Normal);
        bot.Stock.Add(ResourceType.Gold, 300);
        var home = game.TownCenter(bot).Position;
        bot.Hero.Position = game.Walkable(Vector2.Lerp(home, game.MapCenter, 0.5f));

        TestGames.Run(game, TestGames.Seconds(30));

        bot.HeroState.Items.Should().Contain(i => i != null && i.Id == "ironSword");
    }

    private static BotHeroUpgrades Run(Game game, Player bot, BotDifficulty difficulty)
    {
        var upgrades = new BotHeroUpgrades(game, bot, BotProfile.For(difficulty));
        var reserve = new int[Resources.Count];
        reserve[(int)ResourceType.Gold] = GoldReserve;
        upgrades.Run(BotView.Capture(game, bot, new HashSet<int>()), reserve, urgent: false);
        return upgrades;
    }

    private static (Game Game, Player Bot) Seat()
    {
        var game = TestGames.Create();
        return (game, game.Players[0]);
    }

    private static void SetGold(Player player, int gold)
    {
        player.Stock.TrySpend(player.Stock.Snapshot());
        player.Stock.Add(ResourceType.Gold, gold);
    }

    private static int Gold(ItemDef item)
    {
        return item.CostAmounts[(int)ResourceType.Gold];
    }

    private static ItemDef Item(Game game, string id)
    {
        game.Content.TryGetItem(id, out var item).Should().BeTrue();
        return item;
    }
}
