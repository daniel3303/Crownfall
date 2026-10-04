using System.Numerics;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests;

/// <summary>Which hero each seat leads when a match starts.</summary>
public class MatchSetupTests
{
    [Fact]
    public void Create_PickedHeroes_LeadTheirSeatsWithTheirOwnKits()
    {
        var game = TestGames.CreateWithHeroes("ranger", "blademaster");

        game.Players[0].Hero.Def.Id.Should().Be("ranger");
        game.Players[0].HeroState.Kit.Select(a => a.Id).Should().Equal("volley", "huntersFocus", "roll", "arrowRain");
        game.Players[1].Hero.Def.Id.Should().Be("blademaster");
        game.Players[1].HeroState.Cooldowns.Should().HaveCount(4);
    }

    [Fact]
    public void Create_NoPick_LeadsWithTheClassicHero()
    {
        var game = TestGames.Create();

        game.Players[0].Hero.Def.Id.Should().Be("paladin");
        game.Players[1].Hero.Def.Id.Should().Be("warchief");
    }

    [Fact]
    public void Create_HeroOfAnotherRace_IsRejected()
    {
        var act = () => TestGames.CreateWithHeroes("shaman");

        act.Should().Throw<ArgumentException>().WithMessage("*hero*race*");
    }

    [Fact]
    public void Create_UnknownHero_IsRejected()
    {
        var act = () => TestGames.CreateWithHeroes("paladin", "lich");

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void ChangeHero_FreshHero_StandsWhereTheOldOneStood()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var old = player.Hero;
        var archmage = game.Content.Unit("archmage");

        var changed = game.Heroes.TryChangeHero(player, archmage);
        game.Step([]);

        changed.Should().BeTrue();
        player.Hero.Def.Should().BeSameAs(archmage);
        player.HeroState.Def.Should().BeSameAs(archmage);
        Vector2.Distance(player.Hero.Position, old.Position).Should().BeLessThan(0.5f);
        old.IsAlive.Should().BeFalse();
        game.Entities.Units.Where(u => u.Owner == player && u.IsHero).Should().ContainSingle();
    }

    [Fact]
    public void ChangeHero_AfterTheHeroEarnedXp_IsRefused()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        game.Heroes.AddXp(player, 1);

        game.Heroes.TryChangeHero(player, game.Content.Unit("ranger")).Should().BeFalse();
        player.Hero.Def.Id.Should().Be("paladin");
    }

    [Fact]
    public void ChangeHero_ToAnotherRacesHero_IsRefused()
    {
        var game = TestGames.Create();
        var player = game.Players[0];

        game.Heroes.TryChangeHero(player, game.Content.Unit("shaman")).Should().BeFalse();
        player.Hero.Def.Id.Should().Be("paladin");
    }
}
