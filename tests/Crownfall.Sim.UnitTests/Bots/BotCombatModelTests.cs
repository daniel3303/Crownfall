using System.Numerics;
using Crownfall.Sim.Bots;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Bots;

/// <summary>How the bots' combat model weighs heroes in a fight at hand and prices a dragon hunt.</summary>
public class BotCombatModelTests
{
    private readonly ITestOutputHelper _output;

    public BotCombatModelTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Fact]
    public void LocalPower_AFirstLevelHero_CountsFarBelowItsStrategicPowerUntilItsCleaveKillsOutright()
    {
        var game = TestGames.Create();
        var model = new BotCombatModel(game.Content);
        var hero = game.Players[0].Hero;
        var spearman = game.Spawn("spearman", game.Players[0], game.QuietSpot());

        var young = model.LocalPower(hero) / model.Power(hero);
        game.Players[0].HeroState.Level = 8;
        var veteran = model.LocalPower(hero) / model.Power(hero);

        _output.WriteLine($"local share of power: level 1 {young:F2}, level 8 {veteran:F2}");
        young.Should().BeLessThan(0.6f, "a first level cleave only chips soldiers");
        veteran.Should().BeGreaterThan(young + 0.2f, "a cleave that kills soldiers outright counts in full");
        model.LocalPower(spearman).Should().Be(model.Power(spearman), "soldiers weigh the same either way");
    }

    [Fact]
    public void SlayLosses_ABigArmyWithItsHero_IsCheapEnoughForHardWhileASmallBandIsNot()
    {
        var game = TestGames.Create();
        var model = new BotCombatModel(game.Content);
        var owner = game.Players[0];
        var dragon = game.Content.DragonUnit;
        var share = BotProfile.For(BotDifficulty.Hard).DragonLossShare;
        owner.HeroState.Level = 6;
        var army = new List<Unit> { owner.Hero };
        for (var i = 0; i < 30; i++)
        {
            army.Add(game.Spawn(i % 3 == 0 ? "archer" : "spearman", owner, game.QuietSpot() + new Vector2(i % 6, i / 6)));
        }
        var band = army.Skip(1).Take(8).ToList();

        var big = model.SlayLosses(army, dragon, dragon.Hp, game.Tick);
        var small = model.SlayLosses(band, dragon, dragon.Hp, game.Tick);
        var wounded = model.SlayLosses(band, dragon, dragon.Hp * 0.1f, game.Tick);

        _output.WriteLine($"expected losses: army {big:F1} of {army.Count}, band {small:F1} of {band.Count}, band on a wounded dragon {wounded:F1}");
        big.Should().BeLessThanOrEqualTo(share * army.Count);
        small.Should().BeGreaterThan(share * band.Count);
        wounded.Should().BeLessThan(small * 0.2f, "a wounded dragon falls before it can kill many");
    }
}
