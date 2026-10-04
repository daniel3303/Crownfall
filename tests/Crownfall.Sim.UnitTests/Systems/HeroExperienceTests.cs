using System.Numerics;
using Crownfall.Sim.Content;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Systems;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Systems;

public class HeroExperienceTests
{
    private static readonly RulesDef Rules = TestGames.Content.Rules;

    [Fact]
    public void SoloKillXp_GrowsWithVictimLevel_PastTheTable()
    {
        var bounties = Enumerable.Range(1, Rules.HeroKillXp.Count + 3).Select(level => HeroExperience.SoloKillXp(Rules, level)).ToList();

        bounties.Should().BeInAscendingOrder().And.OnlyHaveUniqueItems();
        (bounties[^1] - bounties[^2]).Should().Be(Rules.HeroKillXpPerLevel);
    }

    [Theory]
    [InlineData(5f, 5.5f, 1f)]
    [InlineData(6f, 5f, 1f)]
    [InlineData(7f, 5f, 1.2f)]
    [InlineData(5f, 7f, 0.8f)]
    [InlineData(5f, 8.5f, 0.5f)]
    public void LevelModifier_BeyondOneLevel_ChangesTwentyPercentPerLevel(float victim, float earner, float expected)
    {
        HeroExperience.LevelModifier(Rules, victim, earner).Should().BeApproximately(expected, 0.0001f);
    }

    [Fact]
    public void LevelModifier_HugeGaps_StopAtTheCaps()
    {
        HeroExperience.LevelModifier(Rules, 30, 1).Should().BeApproximately(1 + Rules.HeroKillXpMaxBonus, 0.0001f);
        HeroExperience.LevelModifier(Rules, 1, 30).Should().BeApproximately(1 - Rules.HeroKillXpMaxPenalty, 0.0001f);
    }

    [Theory]
    [InlineData(1, 100f)]
    [InlineData(2, 65f)]
    [InlineData(4, 32.5f)]
    public void BountyShare_SplitsOneHundredThirtyPercentWhenShared(int earners, float each)
    {
        HeroExperience.BountyShare(Rules, 100, earners).Should().BeApproximately(each, 0.0001f);
    }

    [Fact]
    public void HeroKillShare_SharedKill_SplitsTheReducedTotal()
    {
        var solo = HeroExperience.SoloKillXp(Rules, 3);

        HeroExperience.HeroKillShare(Rules, 3, 2).Should().BeApproximately(solo * Rules.HeroSharedKillXpShare[2] / 2, 0.0001f);
    }

    [Fact]
    public void UnitKill_TwoAlliedHeroesNearby_EachGetsTheSharedSplit()
    {
        var (game, first, second, spot) = AlliedHeroes();
        second.Hero.Position = spot + new Vector2(0, 2);
        var victim = game.Spawn("spearman", game.Players[2], spot + new Vector2(1, 0));

        game.Kill(victim, first);

        var each = (int)MathF.Round(victim.Def.Xp * Rules.SharedXpTotal / 2);
        (first.HeroState.Xp, second.HeroState.Xp).Should().Be((each, each));
    }

    [Fact]
    public void UnitKill_AllyOutOfRange_GetsNothing()
    {
        var (game, first, second, spot) = AlliedHeroes();
        second.Hero.Position = spot + new Vector2(Rules.HeroXpRadius + 3, 0);
        var victim = game.Spawn("spearman", game.Players[2], spot + new Vector2(1, 0));

        game.Kill(victim, first);

        (first.HeroState.Xp, second.HeroState.Xp).Should().Be((victim.Def.Xp, 0));
    }

    [Fact]
    public void HeroKill_HigherLevelVictim_PaysTheComebackBonus()
    {
        var (game, killer, _, spot) = AlliedHeroes(farAlly: true);
        var victim = game.Players[2];
        game.Heroes.AddXp(victim, Rules.HeroXpForLevel(6));
        victim.Hero.Position = spot + new Vector2(1, 0);

        game.Kill(victim.Hero, killer);

        var expected = HeroExperience.SoloKillXp(Rules, 6) * HeroExperience.LevelModifier(Rules, 6, 1);
        killer.HeroState.Xp.Should().Be((int)MathF.Round(expected));
        killer.HeroState.Xp.Should().BeGreaterThan((int)HeroExperience.SoloKillXp(Rules, 6));
    }

    [Fact]
    public void HeroKill_LowerLevelVictim_PaysLess()
    {
        var (game, killer, _, spot) = AlliedHeroes(farAlly: true);
        game.Heroes.AddXp(killer, Rules.HeroXpForLevel(6));
        var start = killer.HeroState.Xp;
        var victim = game.Players[2];
        victim.Hero.Position = spot + new Vector2(1, 0);

        game.Kill(victim.Hero, killer);

        var gained = killer.HeroState.Xp - start;
        gained.Should().Be((int)MathF.Round(HeroExperience.SoloKillXp(Rules, 1) * HeroExperience.LevelModifier(Rules, 1, 6)));
        gained.Should().BeLessThan((int)HeroExperience.SoloKillXp(Rules, 1));
    }

    /// <summary>A two-versus-two game with team 0's heroes at a quiet spot; the second ally is parked far away when asked.</summary>
    private static (Game Game, Player First, Player Second, Vector2 Spot) AlliedHeroes(bool farAlly = false)
    {
        var game = TestGames.Create(perTeam: 2);
        var spot = game.QuietSpot();
        var (first, second) = (game.Players[0], game.Players[1]);
        first.Hero.Position = spot;
        second.Hero.Position = farAlly ? spot + new Vector2(Rules.HeroXpRadius + 3, 0) : spot;
        game.Players[2].Should().Match<Player>(p => p.Team == 1);
        return (game, first, second, spot);
    }
}
