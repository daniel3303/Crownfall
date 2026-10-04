using Crownfall.Sim.Content;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Content;

public class HeroRosterTests
{
    // Pinned, since a string hash would pass every other test here yet change the picks from one process to the next.
    [Theory]
    [InlineData(1, 0, "archmage", "shaman")]
    [InlineData(5, 1, "paladin", "warchief")]
    [InlineData(42, 2, "archmage", "shaman")]
    [InlineData(42, 3, "ranger", "blademaster")]
    [InlineData(1234567, 2, "ranger", "blademaster")]
    public void BotPick_FixedSeedAndSeat_PicksThePinnedHeroOnEveryRun(int seed, int seat, string human, string orc)
    {
        var humans = HeroRoster.BotPick(TestGames.Content.Race("humans"), seed, seat);
        var orcs = HeroRoster.BotPick(TestGames.Content.Race("orcs"), seed, seat);

        humans.Id.Should().Be(human);
        orcs.Id.Should().Be(orc);
    }

    [Fact]
    public void BotPick_AcrossSeedsAndSeats_FieldsEveryHeroOfTheRaceAndNoOther()
    {
        foreach (var race in TestGames.Content.Races)
        {
            var picks = Enumerable.Range(1, 30).SelectMany(seed => Enumerable.Range(0, 4).Select(seat => HeroRoster.BotPick(race, seed, seat))).ToList();

            picks.Distinct().Should().BeEquivalentTo(race.HeroUnits);
        }
    }

    [Fact]
    public void BotPick_SeatsOfOneMatch_DoNotAllPickAlike()
    {
        var race = TestGames.Content.Race("humans");

        var picks = Enumerable.Range(0, 8).Select(seat => HeroRoster.BotPick(race, 42, seat).Id).Distinct();

        picks.Should().HaveCountGreaterThan(1);
    }
}
