using Crownfall.Sim.Content;
using Crownfall.Sim.UnitTests.Support;
using Newtonsoft.Json.Linq;

namespace Crownfall.Sim.UnitTests.Content;

public class ContentDbTests
{
    [Fact]
    public void Kinds_NumberUnitsThenBuildingsThenNodes()
    {
        var content = TestGames.Content;
        var kinds = content.Units.Select(u => u.Kind)
            .Concat(content.Buildings.Select(b => b.Kind))
            .Concat(content.Nodes.Select(n => n.Kind))
            .ToList();

        kinds.Should().Equal(Enumerable.Range(0, kinds.Count));
    }

    [Fact]
    public void Races_ReferenceHeroUnits()
    {
        TestGames.Content.Races.Should().OnlyContain(r => r.HeroUnit != null && r.HeroUnit.IsHero);
    }

    [Fact]
    public void Races_ListThreeHeroesEachWithTheClassicOneFirst()
    {
        foreach (var race in TestGames.Content.Races)
        {
            race.HeroUnits.Should().HaveCount(3);
            race.HeroUnits[0].Should().BeSameAs(race.HeroUnit);
            race.HeroUnits.Should().OnlyContain(h => h.IsHero);
        }
    }

    [Fact]
    public void Heroes_EachHasAFourAbilityKitAndTwoTalentsPerTalentLevel()
    {
        var content = TestGames.Content;
        foreach (var hero in content.Races.SelectMany(r => r.HeroUnits))
        {
            hero.Kit.Select(a => a.Key).Should().Equal("Q", "W", "E", "R");
            hero.Talents.Should().HaveCount(content.Rules.HeroTalentLevels.Count);
            hero.Talents.Should().OnlyContain(tier => tier.Count == 2);
            hero.Talents.SelectMany(t => t).Where(t => t.Ability != null).Should().OnlyContain(t => hero.Abilities.Contains(t.Ability));
        }
        content.Races.SelectMany(r => r.HeroUnits).SelectMany(h => h.Talents).SelectMany(t => t).Select(t => t.Id)
            .Should().OnlyHaveUniqueItems("a talent id names one option of one hero");
    }

    [Fact]
    public void ClassicHeroes_KeepTheirOriginalKit()
    {
        var content = TestGames.Content;

        content.Unit("paladin").Abilities.Should().Equal("cleave", "rally", "charge", "doomfall");
        content.Unit("warchief").Abilities.Should().Equal("cleave", "rally", "charge", "doomfall");
    }

    [Fact]
    public void UniqueUnits_BelongToOneRaceAndNeedALevelTwoBarracks()
    {
        var content = TestGames.Content;
        var barracks = content.Building("barracks");

        content.Unit("knight").Races.Should().Equal("humans");
        content.Unit("berserker").Races.Should().Equal("orcs");
        barracks.TrainableUnits.Should().Contain([content.Unit("knight"), content.Unit("berserker")]);
        content.Unit("knight").TrainsAtLevel(1).Should().BeFalse();
        content.Unit("knight").TrainsAtLevel(2).Should().BeTrue();
        content.Unit("berserker").AllowsRace("humans").Should().BeFalse();
        content.Unit("spearman").AllowsRace("orcs").Should().BeTrue("a unit naming no race is open to every race");
    }

    [Fact]
    public void Parse_TalentForAnAbilityOutsideTheKit_IsRejected()
    {
        var json = Edit(root => root["units"].First(u => (string)u["id"] == "paladin")["talents"][0][0]["ability"] = "fireball");

        var act = () => ContentDb.Parse(json);

        act.Should().Throw<InvalidDataException>().WithMessage("*outside its kit*");
    }

    [Fact]
    public void Parse_HeroWithoutATierPerTalentLevel_IsRejected()
    {
        var json = Edit(root => ((JArray)root["units"].First(u => (string)u["id"] == "ranger")["talents"]).RemoveAt(2));

        var act = () => ContentDb.Parse(json);

        act.Should().Throw<InvalidDataException>().WithMessage("*talent tiers*");
    }

    [Fact]
    public void Parse_TalentTierWithOneOption_IsRejected()
    {
        var json = Edit(root => ((JArray)root["units"].First(u => (string)u["id"] == "shaman")["talents"][1]).RemoveAt(1));

        var act = () => ContentDb.Parse(json);

        act.Should().Throw<InvalidDataException>().WithMessage("*needs 2 options*");
    }

    [Fact]
    public void Parse_HeroListingATalentTwice_IsRejected()
    {
        var json = Edit(root => root["units"].First(u => (string)u["id"] == "blademaster")["talents"][2][1]["id"] = "razorWind");

        var act = () => ContentDb.Parse(json);

        act.Should().Throw<InvalidDataException>().WithMessage("*'razorWind' twice*");
    }

    [Fact]
    public void Parse_RaceListingAnotherRacesHeroWithoutItsOwn_IsRejected()
    {
        var json = Edit(root => root["races"].First(r => (string)r["id"] == "humans")["heroes"] = new JArray("archmage", "shaman"));

        var act = () => ContentDb.Parse(json);

        act.Should().Throw<InvalidDataException>().WithMessage("*classic hero*");
    }

    [Fact]
    public void Parse_UnitForAnUnknownRace_IsRejected()
    {
        var json = Edit(root => root["units"].First(u => (string)u["id"] == "knight")["races"] = new JArray("elves"));

        var act = () => ContentDb.Parse(json);

        act.Should().Throw<InvalidDataException>().WithMessage("*unknown race*");
    }

    [Fact]
    public void Parse_UnknownField_IsRejected()
    {
        var act = () => ContentDb.Parse("""{ "version": 1, "surprise": true }""");

        act.Should().Throw<Newtonsoft.Json.JsonSerializationException>();
    }

    /// <summary>The shipped content with one edit applied, as JSON text.</summary>
    private static string Edit(Action<JObject> edit)
    {
        var root = JObject.Parse(File.ReadAllText(ContentDb.FindDefaultPath()));
        edit(root);
        return root.ToString();
    }
}
