using Crownfall.Sim.UnitTests.Support;

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
    public void Parse_UnknownField_IsRejected()
    {
        var act = () => Crownfall.Sim.Content.ContentDb.Parse("""{ "version": 1, "surprise": true }""");

        act.Should().Throw<Newtonsoft.Json.JsonSerializationException>();
    }
}
