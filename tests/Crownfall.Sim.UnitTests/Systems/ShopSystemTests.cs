using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
using Crownfall.Sim.Systems;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Systems;

public class ShopSystemTests
{
    [Fact]
    public void Buy_HeroBesideItsTownCenter_PaysThePriceIntoTheFirstFreeSlot()
    {
        var (game, player) = Shopper();
        var sword = Item(game, "ironSword");
        var gold = player.Stock[ResourceType.Gold];

        game.Issue(player, new BuyItemCommand { Item = sword.Id });

        player.HeroState.Items[0].Should().BeSameAs(sword);
        player.Stock[ResourceType.Gold].Should().Be(gold - sword.CostAmounts[(int)ResourceType.Gold]);
        game.Shop.Refusal(player).Should().BeNull();
    }

    [Fact]
    public void Buy_HeroAwayFromEveryTownCenter_IsRefusedWithAWarning()
    {
        var (game, player) = Shopper();
        player.Hero.Position = game.QuietSpot();
        var stock = player.Stock.Snapshot();

        game.Issue(player, new BuyItemCommand { Item = "ironSword" });

        player.HeroState.Items.Should().OnlyContain(i => i == null);
        player.Stock.Snapshot().Should().Equal(stock);
        Warnings(game, player).Should().ContainSingle().Which.Should().Contain("town center");
    }

    [Fact]
    public void Refusal_MeasuresTheShopRangeFromTheTownCentersEdge()
    {
        var (game, player) = Shopper();
        var rect = game.TownCenter(player).Rect;
        var range = game.Content.Rules.ItemShopRange;
        var y = rect.Y + rect.Height / 2f;

        player.Hero.Position = new Vector2(rect.X + rect.Width + range - 0.2f, y);
        var inside = game.Shop.Refusal(player);
        player.Hero.Position = new Vector2(rect.X + rect.Width + range + 0.2f, y);
        var outside = game.Shop.Refusal(player);

        inside.Should().BeNull();
        outside.Should().Contain("town center");
    }

    [Fact]
    public void Refusal_AnUnfinishedTownCenter_IsNoShop()
    {
        var (game, player) = Shopper();
        player.Hero.Position = game.QuietSpot();
        var foundation = game.Place("townCenter", player, player.Hero.Position + new Vector2(3, 0), complete: false);
        player.Hero.Position = foundation.Position + new Vector2(0, foundation.Radius + 1);

        game.Shop.Refusal(player).Should().Contain("town center");
    }

    [Fact]
    public void Buy_WhileTheHeroIsDown_IsRefused()
    {
        var (game, player) = Shopper();
        game.Kill(player.Hero, game.Players[1]);

        game.Issue(player, new BuyItemCommand { Item = "ironSword" });

        player.HeroState.Items.Should().OnlyContain(i => i == null);
        Warnings(game, player).Should().ContainSingle().Which.Should().Contain("alive");
    }

    [Fact]
    public void Buy_SixItems_FillsTheInventoryAndRefusesASeventh()
    {
        var (game, player) = Shopper();
        var items = game.Content.Items;

        foreach (var item in items.Take(game.Content.Rules.HeroInventorySlots))
        {
            game.Issue(player, new BuyItemCommand { Item = item.Id });
        }
        game.Issue(player, new BuyItemCommand { Item = items[game.Content.Rules.HeroInventorySlots].Id });

        player.HeroState.Items.Should().Equal(items.Take(game.Content.Rules.HeroInventorySlots));
        Warnings(game, player).Should().ContainSingle().Which.Should().Contain("full");
    }

    [Fact]
    public void Buy_AnItemTheHeroAlreadyCarries_IsRefused()
    {
        var (game, player) = Shopper();

        game.Issue(player, new BuyItemCommand { Item = "ironSword" });
        game.Issue(player, new BuyItemCommand { Item = "ironSword" });

        player.HeroState.Items.Count(i => i?.Id == "ironSword").Should().Be(1);
        Warnings(game, player).Should().ContainSingle().Which.Should().Contain("already");
    }

    [Fact]
    public void Buy_WithoutEnoughGold_IsRefusedAndSpendsNothing()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        player.Stock.TrySpend(player.Stock.Snapshot());
        player.Stock.Add(ResourceType.Gold, 50);

        game.Issue(player, new BuyItemCommand { Item = "ironSword" });

        player.HeroState.Items.Should().OnlyContain(i => i == null);
        player.Stock[ResourceType.Gold].Should().Be(50);
        Warnings(game, player).Should().ContainSingle().Which.Should().Contain("gold");
    }

    [Fact]
    public void Buy_HealthItem_GrowsTheLiveHeroAndSellingTakesItBackWithoutHealing()
    {
        var (game, player) = Shopper();
        var hero = player.Hero;
        var charm = Item(game, "vitalityCharm");
        var maxHp = hero.MaxHp;
        hero.Hp = maxHp - 10;
        hero.LastDamagedTick = game.Tick + TestGames.Seconds(60);

        game.Issue(player, new BuyItemCommand { Item = charm.Id });

        hero.MaxHp.Should().Be(maxHp + charm.Hp);
        hero.Hp.Should().Be(maxHp - 10 + charm.Hp);

        game.Issue(player, new SellItemCommand { Slot = 0 });

        hero.MaxHp.Should().Be(maxHp);
        hero.Hp.Should().Be(maxHp - 10, "a buy and a sell together never heal the hero");

        hero.Hp = 5;
        game.Issue(player, new BuyItemCommand { Item = charm.Id });
        game.Issue(player, new SellItemCommand { Slot = 0 });

        hero.Hp.Should().Be(5);
        hero.IsAlive.Should().BeTrue();
    }

    [Fact]
    public void Sell_RefundsHalfThePriceAndEmptiesTheSlot()
    {
        var (game, player) = Shopper();
        var plate = Item(game, "plateArmor");
        game.Issue(player, new BuyItemCommand { Item = plate.Id });
        var stock = player.Stock.Snapshot();

        game.Issue(player, new SellItemCommand { Slot = 0 });

        player.HeroState.Items[0].Should().BeNull();
        player.Stock[ResourceType.Gold].Should().Be(stock[(int)ResourceType.Gold] + plate.CostAmounts[(int)ResourceType.Gold] / 2);
        player.Stock[ResourceType.Stone].Should().Be(stock[(int)ResourceType.Stone] + plate.CostAmounts[(int)ResourceType.Stone] / 2);
    }

    [Fact]
    public void Sell_AnEmptyOrUnknownSlot_DoesNothing()
    {
        var (game, player) = Shopper();
        var stock = player.Stock.Snapshot();

        game.Issue(player, new SellItemCommand { Slot = 0 });
        game.Issue(player, new SellItemCommand { Slot = 99 });
        game.Issue(player, new SellItemCommand { Slot = -1 });

        player.Stock.Snapshot().Should().Equal(stock);
        Warnings(game, player).Should().BeEmpty();
    }

    [Fact]
    public void Items_HeroDiesAndIsRevived_KeepsItsItemsAndTheirHealth()
    {
        var (game, player) = Shopper();
        game.Issue(player, new BuyItemCommand { Item = "vitalityCharm" });
        game.Issue(player, new BuyItemCommand { Item = "ironSword" });
        var maxHp = player.Hero.MaxHp;
        var attack = player.Hero.AttackDamage;

        game.Kill(player.Hero, game.Players[1]);
        TestGames.Run(game, player.HeroState.ReviveTick - game.Tick);
        game.Issue(player, new ReviveHeroCommand());

        player.HeroState.Items.Where(i => i != null).Select(i => i.Id).Should().Equal("vitalityCharm", "ironSword");
        player.Hero.MaxHp.Should().Be(maxHp);
        player.Hero.AttackDamage.Should().Be(attack);
    }

    [Fact]
    public void Items_AttackSpeedMoveSpeedAndLifeSteal_AddToTheHerosOwn()
    {
        var (game, player) = Shopper();
        var hero = player.Hero;
        var cooldown = hero.CooldownAt(game.Tick);
        var speed = hero.SpeedAt(game.Tick);
        var attack = hero.AttackDamage;

        foreach (var id in new[] { "hasteGloves", "swiftBoots", "vampireFang" })
        {
            game.Issue(player, new BuyItemCommand { Item = id });
        }

        hero.CooldownAt(game.Tick).Should().BeApproximately(hero.Def.Cooldown / (1 + Item(game, "hasteGloves").AttackSpeed), 0.0001f);
        cooldown.Should().Be(hero.Def.Cooldown);
        hero.SpeedAt(game.Tick).Should().BeApproximately(speed * (1 + Item(game, "swiftBoots").MoveSpeed), 0.0001f);
        hero.Hero.LifeSteal.Should().Be(Item(game, "vampireFang").LifeSteal);
        hero.AttackDamage.Should().Be(attack + Item(game, "vampireFang").Attack);
    }

    [Fact]
    public void Items_Armor_ReducesTheDamageTheLiveHeroTakes()
    {
        var (game, player) = Shopper();
        var hero = player.Hero;
        var spearman = game.Content.Unit("spearman");
        var before = CombatSystem.ComputeDamage(20, DamageType.Melee, [], hero);

        game.Issue(player, new BuyItemCommand { Item = "plateArmor" });

        var plate = Item(game, "plateArmor");
        CombatSystem.ComputeDamage(20, DamageType.Melee, [], hero).Should().Be(before - plate.Armor.Melee);
        CombatSystem.ComputeDamage(20, DamageType.Melee, [], hero.Def).Should().Be(before, "the unit type's armor is unchanged");
        hero.ArmorAgainst(DamageType.Pierce).Should().Be(hero.Def.Armor.Pierce + plate.Armor.Pierce);
        CombatSystem.ComputeDamage(spearman.Attack, DamageType.Melee, [], hero).Should().BeGreaterThanOrEqualTo(1);
    }

    [Fact]
    public void Items_Regen_HealsTheHeroEvenWhileItIsBeingHit()
    {
        var (game, player) = Shopper();
        game.Issue(player, new BuyItemCommand { Item = "regenRing" });
        var hero = player.Hero;
        hero.Position = game.QuietSpot();
        hero.Hp = 100;

        for (var i = 0; i < TestGames.Seconds(2); i++)
        {
            hero.LastDamagedTick = game.Tick;
            game.Step([]);
        }

        hero.Hp.Should().BeApproximately(100 + Item(game, "regenRing").Regen * 2, 0.3f);
    }

    [Fact]
    public void Items_CooldownReduction_StacksWithTheLevelShareUnderOneCap()
    {
        var (game, player) = Shopper();
        var rules = game.Content.Rules;
        var talisman = Item(game, "sageTalisman");
        game.Issue(player, new BuyItemCommand { Item = talisman.Id });
        var slot = TestGames.Slot(player, "cleave");
        var cleave = player.HeroState.Kit[slot];
        player.Hero.Position = game.QuietSpot();

        game.Issue(player, new AbilityCommand { Slot = slot });

        player.HeroState.Cooldowns[slot].Should().BeApproximately(cleave.Cooldown * (1 - talisman.CooldownReduction) - game.Dt, 0.001f);
        rules.HeroCooldownFactor(1000, talisman.CooldownReduction).Should().BeApproximately(1 - rules.HeroCooldownReductionCap, 0.0001f);
        rules.HeroCooldownFactor(1000).Should().BeApproximately(1 - rules.HeroCooldownReductionMax, 0.0001f, "without items the level share keeps its own cap");
        rules.HeroCooldownFactor(3, talisman.CooldownReduction).Should().BeApproximately(1 - 2 * rules.HeroCooldownReductionPerLevel - talisman.CooldownReduction, 0.0001f);
    }

    [Fact]
    public void Buy_ByOnePlayer_FillsOnlyThatPlayersInventory()
    {
        var (game, player) = Shopper();
        var other = game.Players[1];

        game.Issue(player, new BuyItemCommand { Item = "ironSword" });

        other.HeroState.Items.Should().OnlyContain(i => i == null);
    }

    [Fact]
    public void Sell_HeroAwayOrFallen_IsRefusedAndKeepsTheItem()
    {
        var (game, player) = Shopper();
        var sword = Item(game, "ironSword");
        game.Issue(player, new BuyItemCommand { Item = sword.Id });
        var stock = player.Stock.Snapshot();

        player.Hero.Position = game.QuietSpot();
        game.Issue(player, new SellItemCommand { Slot = 0 });
        var away = Warnings(game, player);
        game.Kill(player.Hero, null);
        game.Issue(player, new SellItemCommand { Slot = 0 });
        var fallen = Warnings(game, player);

        player.HeroState.Items[0].Should().BeSameAs(sword);
        player.Stock.Snapshot().Should().Equal(stock);
        away.Should().ContainSingle().Which.Should().Contain("town centers");
        fallen.Should().ContainSingle().Which.Should().Contain("alive");
    }

    /// <summary>A fresh match whose first player has plenty of every resource and its hero at home.</summary>
    private static (Game Game, Player Player) Shopper()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        foreach (var type in Resources.All)
        {
            player.Stock.Add(type, 5000);
        }
        return (game, player);
    }

    private static ItemDef Item(Game game, string id)
    {
        game.Content.TryGetItem(id, out var item).Should().BeTrue();
        return item;
    }

    private static List<string> Warnings(Game game, Player player)
    {
        return game.Events.OfType<NoticeEvent>().Where(n => n.Player == player.Index && n.Tone == NoticeTone.Warning).Select(n => n.Text).ToList();
    }
}
