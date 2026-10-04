using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Systems;

/// <summary>Hero kill gold with first blood, kill streaks, shutdowns and their match-wide announcements.</summary>
public class HeroBountyTests
{
    [Fact]
    public void FirstBlood_TheMatchsFirstHeroKill_PaysTheBonusOnceAndAnnouncesItToEveryone()
    {
        var game = TestGames.Create(perTeam: 2);
        var (killer, victim) = (game.Players[0], Enemy(game, game.Players[0]));
        var rules = game.Content.Rules;
        Empty(killer);

        game.Kill(victim.Hero, killer);

        killer.Stock[ResourceType.Gold].Should().Be(rules.HeroKillGold + rules.FirstBloodGold);
        var announcement = game.Events.OfType<AnnouncementEvent>().Should().ContainSingle().Subject;
        announcement.Type.Should().Be(AnnouncementType.FirstBlood);
        announcement.Player.Should().Be(killer.Index);
        game.Players.Should().OnlyContain(p => announcement.IsVisibleTo(game, p));
        game.Heroes.FirstBloodTaken.Should().BeTrue();

        Revive(game, victim);
        Empty(killer);
        game.Kill(victim.Hero, killer);

        killer.Stock[ResourceType.Gold].Should().Be(rules.HeroKillGold, "first blood is paid only once a match");
        game.Events.OfType<AnnouncementEvent>().Should().BeEmpty();
    }

    [Fact]
    public void FirstBlood_AHeroKilledWithoutAnEnemyKiller_DoesNotTakeIt()
    {
        var game = TestGames.Create();

        game.Kill(game.Players[0].Hero, null);

        game.Heroes.FirstBloodTaken.Should().BeFalse();
        game.Events.OfType<AnnouncementEvent>().Should().BeEmpty();
    }

    [Fact]
    public void Streak_GrowsWithEveryEnemyHeroSlainAndEndsWhenTheHeroDies()
    {
        var game = TestGames.Create();
        var (killer, victim) = (game.Players[0], game.Players[1]);

        for (var i = 0; i < 2; i++)
        {
            game.Kill(victim.Hero, killer);
            Revive(game, victim);
        }

        killer.HeroState.KillStreak.Should().Be(2);
        victim.HeroState.KillStreak.Should().Be(0);

        game.Kill(killer.Hero, null);

        killer.HeroState.KillStreak.Should().Be(0, "any death ends a streak");
    }

    [Fact]
    public void Streak_ReachingEachTier_AnnouncesItsTitle()
    {
        var game = TestGames.Create();
        var (killer, victim) = (game.Players[0], game.Players[1]);
        var tiers = game.Content.Rules.KillStreaks;
        var titles = new List<string>();

        for (var kill = 1; kill <= tiers[^1].Kills + 1; kill++)
        {
            game.Kill(victim.Hero, killer);
            titles.AddRange(game.Events.OfType<AnnouncementEvent>().Where(a => a.Type == AnnouncementType.KillStreak).Select(a => a.Title));
            Revive(game, victim);
        }

        titles.Should().Equal([.. tiers.Select(t => t.Title), tiers[^1].Title], "every tier is called once and the top one repeats beyond it");
        game.Heroes.StreakTitle(tiers[0].Kills - 1).Should().BeNull();
    }

    [Fact]
    public void Shutdown_SlayingAHeroOnAStreak_PaysTheBonusForItsLength()
    {
        var game = TestGames.Create();
        var (hunter, streaker) = (game.Players[0], game.Players[1]);
        var rules = game.Content.Rules;
        game.Kill(streaker.Hero, hunter);
        Revive(game, streaker);
        streaker.HeroState.KillStreak = rules.HeroShutdownStreak + 2;
        Empty(hunter);

        game.Kill(streaker.Hero, hunter);

        var bonus = rules.HeroShutdownGold + 2 * rules.HeroShutdownGoldPerKill;
        game.Heroes.ShutdownGold(rules.HeroShutdownStreak + 2).Should().Be(bonus);
        hunter.Stock[ResourceType.Gold].Should().Be(rules.HeroKillGold + bonus);
        var shutdown = game.Events.OfType<AnnouncementEvent>().Should().ContainSingle(a => a.Type == AnnouncementType.Shutdown).Subject;
        shutdown.Text.Should().Contain(streaker.Name).And.Contain(rules.KillStreaks[1].Title);
        streaker.HeroState.KillStreak.Should().Be(0);
    }

    [Fact]
    public void Shutdown_AShortStreak_PaysNoBonus()
    {
        var game = TestGames.Create();
        var rules = game.Content.Rules;

        game.Heroes.ShutdownGold(rules.HeroShutdownStreak - 1).Should().Be(0);
        game.Heroes.ShutdownGold(0).Should().Be(0);
        game.Heroes.ShutdownGold(rules.HeroShutdownStreak).Should().Be(rules.HeroShutdownGold);
    }

    [Fact]
    public void Bounty_ATeammateKill_PaysNothingAndGrowsNoStreak()
    {
        var game = TestGames.Create(perTeam: 2);
        var victim = game.Players[0];
        var mate = game.Players.First(p => p != victim && p.Team == victim.Team);
        var gold = mate.Stock[ResourceType.Gold];

        game.Kill(victim.Hero, mate);

        mate.Stock[ResourceType.Gold].Should().Be(gold);
        mate.HeroState.KillStreak.Should().Be(0);
        game.Heroes.FirstBloodTaken.Should().BeFalse();
    }

    private static Player Enemy(Game game, Player player)
    {
        return game.Players.First(p => p.Team != player.Team);
    }

    private static void Empty(Player player)
    {
        player.Stock.TrySpend(player.Stock.Snapshot());
    }

    /// <summary>Brings the hero straight back and steps once, which also clears the last kill's events.</summary>
    private static void Revive(Game game, Player player)
    {
        game.Heroes.SpawnHero(player, player.Start.Center + new System.Numerics.Vector2(0, 4));
        game.Step([]);
    }
}
