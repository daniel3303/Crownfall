using System.Numerics;
using Crownfall.Server.Matches;
using Crownfall.Sim;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;

namespace Crownfall.Server.UnitTests.Matches;

public class HeroViewFactoryTests
{
    [Fact]
    public void Create_HeroCarryingItems_ListsThemPerSlotAndCountsThemInItsStats()
    {
        var (game, player) = Seat();
        var before = HeroViewFactory.Create(game, player).Stats;

        Buy(game, player, "vitalityCharm", "leatherArmor", "sageTalisman");
        var view = HeroViewFactory.Create(game, player);

        view.Items.Should().Equal("vitalityCharm", "leatherArmor", "sageTalisman", null, null, null);
        view.CanShop.Should().BeTrue();
        view.Stats.MaxHp.Should().Be(before.MaxHp + Item(game, "vitalityCharm").Hp);
        view.Stats.ArmorMelee.Should().Be(before.ArmorMelee + Item(game, "leatherArmor").Armor.Melee);
        view.CooldownFactor.Should().BeApproximately(game.Content.Rules.HeroCooldownFactor(1, Item(game, "sageTalisman").CooldownReduction), 0.0001f);
    }

    [Fact]
    public void Create_HeroAwayFromEveryTownCenter_CannotShop()
    {
        var (game, player) = Seat();

        player.Hero.Position = game.MapCenter;

        HeroViewFactory.Create(game, player).CanShop.Should().BeFalse();
    }

    [Fact]
    public void Create_FallenHero_KeepsItsItemsInTheStatsItReturnsWith()
    {
        var (game, player) = Seat();
        Buy(game, player, "vitalityCharm", "regenRing");
        var alive = HeroViewFactory.Create(game, player);
        player.HeroState.KillStreak = 2;

        game.Kill(player.Hero, null);
        var fallen = HeroViewFactory.Create(game, player);

        fallen.Items.Should().Equal(alive.Items);
        fallen.Stats.MaxHp.Should().Be(alive.Stats.MaxHp);
        fallen.CanShop.Should().BeFalse("a fallen hero cannot trade");
        fallen.Streak.Should().Be(0, "a death ends the streak");
    }

    [Fact]
    public void Create_LiveHeroWithARegenItem_RegeneratesWhileHurtEvenUnderFire()
    {
        var (game, player) = Seat();
        Buy(game, player, "regenRing");
        var hero = player.Hero;
        hero.Hp = hero.MaxHp - 50;
        hero.LastDamagedTick = game.Tick;

        var stats = HeroViewFactory.Create(game, player).Stats;

        stats.Regen.Should().Be(Item(game, "regenRing").Regen);
        stats.Regenerating.Should().BeTrue();
    }

    [Fact]
    public void Create_PickedTalent_ListsItInItsTierAndCountsItInTheStats()
    {
        var (game, player) = Seat();
        game.Heroes.AddXp(player, game.Content.Rules.HeroXpForLevel(game.Content.Rules.HeroTalentLevels[0]));
        var before = HeroViewFactory.Create(game, player);

        game.Commands.Apply(player, new PickTalentCommand { Tier = 0, Talent = "bulwark" });
        var view = HeroViewFactory.Create(game, player);

        before.Talents.Should().Equal(null, null, null);
        view.Talents.Should().Equal("bulwark", null, null);
        view.Stats.ArmorMelee.Should().Be(before.Stats.ArmorMelee + 2);
    }

    [Fact]
    public void Create_PickedHero_ReportsItsUnitAndACooldownPerKitSlot()
    {
        var content = ContentDb.Load(ContentDb.FindDefaultPath());
        var game = new Game(content, new MatchConfig { Seed = 1, Teams = 2, PlayersPerTeam = 1 }, [
            new PlayerSetup { Name = "A", Team = 0, Race = "humans", Hero = "archmage" },
            new PlayerSetup { Name = "B", Team = 1, Race = "orcs" },
        ]);

        var view = HeroViewFactory.Create(game, game.Players[0]);

        view.Unit.Should().Be("archmage");
        view.Cooldowns.Should().HaveCount(content.Unit("archmage").Kit.Count);
    }

    private static (Game Game, Player Player) Seat()
    {
        var content = ContentDb.Load(ContentDb.FindDefaultPath());
        var game = new Game(content, new MatchConfig { Seed = 1, Teams = 2, PlayersPerTeam = 1 }, [
            new PlayerSetup { Name = "A", Team = 0, Race = "humans" },
            new PlayerSetup { Name = "B", Team = 1, Race = "orcs" },
        ]);
        var player = game.Players[0];
        foreach (var type in Resources.All)
        {
            player.Stock.Add(type, 2000);
        }
        return (game, player);
    }

    private static void Buy(Game game, Player player, params string[] items)
    {
        foreach (var item in items)
        {
            game.Commands.Apply(player, new BuyItemCommand { Item = item });
        }
        player.HeroState.Items.Count(i => i != null).Should().Be(items.Length);
    }

    private static ItemDef Item(Game game, string id)
    {
        game.Content.TryGetItem(id, out var item).Should().BeTrue();
        return item;
    }
}
