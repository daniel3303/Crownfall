using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Systems;

public class DragonSystemTests
{
    [Fact]
    public void Lair_BeforeTheRulesDelay_StaysEmptyThenTheDragonLandsAtTheCenterForEveryoneToHear()
    {
        var game = TestGames.Create();
        var rules = game.Content.Rules;
        var landing = TestGames.Seconds(rules.Dragon.SpawnSeconds);

        TestGames.Run(game, landing - 1);

        Dragons(game).Should().BeEmpty();
        game.Dragon.SecondsUntilLanding.Should().BeApproximately(0.1f, 0.001f);

        game.Step([]);

        var dragon = Dragons(game).Should().ContainSingle().Subject;
        dragon.Position.Should().Be(game.MapCenter);
        dragon.Camp.Should().BeSameAs(game.Dragon.Lair);
        game.Dragon.IsUp.Should().BeTrue();
        var announcement = game.Events.OfType<AnnouncementEvent>().Should().ContainSingle().Subject;
        announcement.Type.Should().Be(AnnouncementType.DragonSpawned);
        (announcement.X, announcement.Y).Should().Be((game.MapCenter.X, game.MapCenter.Y));
        game.Players.Should().OnlyContain(p => announcement.IsVisibleTo(game, p));
    }

    [Fact]
    public void Lair_PlayerUnitsStandingInIt_DoNotDelayTheLanding()
    {
        var game = TestGames.Create();
        game.Spawn("villager", game.Players[0], game.Walkable(game.MapCenter + new Vector2(1.5f, 0)));
        LandSoon(game);

        TestGames.Run(game, 2);

        Dragons(game).Should().ContainSingle();
    }

    [Fact]
    public void Slain_PaysEveryStockpileOnTheKillersTeamAndBuffsItsUnitsForAWhile()
    {
        var game = TestGames.Create(perTeam: 2);
        var rules = game.Content.Rules;
        var dragon = Land(game);
        var killer = game.Players[0];
        var team = game.Players.Where(p => p.Team == killer.Team).ToList();
        var enemies = game.Players.Where(p => p.Team != killer.Team).ToList();
        foreach (var player in game.Players)
        {
            player.Stock.TrySpend(player.Stock.Snapshot());
        }
        var soldier = game.Spawn("spearman", team[1], game.QuietSpot());
        var attack = soldier.AttackDamage;
        game.Events.Clear();

        game.Kill(dragon, killer);

        team.Should().OnlyContain(p => p.Stock[ResourceType.Gold] == rules.Dragon.Gold && p.AttackBuff == rules.Dragon.BuffAttack);
        enemies.Should().OnlyContain(p => p.Stock[ResourceType.Gold] == 0 && p.AttackBuff == 0);
        soldier.AttackDamage.Should().BeApproximately(attack * (1 + rules.Dragon.BuffAttack), 0.001f);
        soldier.HasTeamBuff.Should().BeTrue();
        game.Events.OfType<DepositEvent>().Select(d => d.Player).Should().BeEquivalentTo(team.Select(p => p.Index));
        game.Events.OfType<AnnouncementEvent>().Should().ContainSingle(a => a.Type == AnnouncementType.DragonSlain && a.Team == killer.Team);
        game.Dragon.BuffSecondsLeft(team[1]).Should().BeApproximately(rules.Dragon.BuffSeconds, 0.001f);

        TestGames.Run(game, TestGames.Seconds(rules.Dragon.BuffSeconds));

        team.Should().OnlyContain(p => p.AttackBuff == 0);
        soldier.AttackDamage.Should().Be(attack);
        game.Dragon.BuffSecondsLeft(team[1]).Should().Be(0);
    }

    [Fact]
    public void Slain_TeammatesSharingAStockpile_AreRewardedOnce()
    {
        var game = TestGames.Create(perTeam: 2, sharing: ResourceSharing.Shared);
        var dragon = Land(game);
        var killer = game.Players[0];
        killer.Stock.TrySpend(killer.Stock.Snapshot());

        game.Kill(dragon, killer);

        killer.Stock[ResourceType.Gold].Should().Be(game.Content.Rules.Dragon.Gold);
        game.Players.Where(p => p.Team == killer.Team).Should().OnlyContain(p => p.AttackBuff > 0);
    }

    [Fact]
    public void Slain_ReturnsAfterTheRespawnTime()
    {
        var game = TestGames.Create();
        var rules = game.Content.Rules;
        game.Kill(Land(game), game.Players[1]);
        game.Step([]);

        game.Dragon.IsUp.Should().BeFalse();
        game.Dragon.SecondsUntilLanding.Should().BeApproximately(rules.Dragon.RespawnSeconds - game.Dt, 0.01f);

        TestGames.Run(game, TestGames.Seconds(rules.Dragon.RespawnSeconds));

        Dragons(game).Should().ContainSingle();
    }

    [Fact]
    public void Dragon_LuredPastItsLeash_WalksBackToTheLairAndHeals()
    {
        var game = TestGames.Create();
        var dragon = Land(game);
        var bait = game.Players[0].Hero;
        bait.Position = game.Walkable(game.MapCenter + new Vector2(2, 0));
        bait.MaxHp = 100000;
        bait.Hp = 100000;
        // One step lets the hero see the dragon it is ordered to strike.
        game.Step([]);
        game.Issue(game.Players[0], new AttackCommand { Units = [bait.Id], Target = dragon.Id });
        TestGames.Run(game, TestGames.Seconds(3));
        dragon.Order.Target.Should().Be(bait, "a hero striking the dragon draws it");
        dragon.Hp -= 500;

        game.Issue(game.Players[0], new MoveCommand { Units = [bait.Id], X = game.Players[0].Start.Center.X, Y = game.Players[0].Start.Center.Y });
        TestGames.Run(game, TestGames.Seconds(30));

        Vector2.Distance(dragon.Position, game.MapCenter).Should().BeLessThan(1.5f);
        dragon.Hp.Should().Be(dragon.MaxHp);
    }

    [Fact]
    public void Dragon_UnitsWalkingThroughTheLair_AreLeftAlone()
    {
        var game = TestGames.Create();
        var dragon = Land(game);
        var owner = game.Players[0];
        var hero = owner.Hero;
        hero.Position = game.Walkable(game.MapCenter + new Vector2(2, 0));
        var spot = game.Walkable(game.MapCenter + new Vector2(-6, 0));
        var spearman = game.Spawn("spearman", owner, spot);

        game.Issue(owner, new MoveCommand { Units = [spearman.Id], X = game.MapCenter.X + 6, Y = game.MapCenter.Y, AttackMove = true });
        TestGames.Run(game, TestGames.Seconds(6));

        dragon.Hp.Should().Be(dragon.MaxHp, "an attack-move does not pick the dragon as a target");
        dragon.Order.Type.Should().Be(OrderType.Idle, "the dragon only fights those who attack it");
        hero.Hp.Should().Be(hero.MaxHp);
        spearman.Hp.Should().Be(spearman.MaxHp);
    }

    [Fact]
    public void Dragon_EveryBlow_AlsoLandsOnEnemiesAroundItsTarget()
    {
        var game = TestGames.Create();
        var dragon = Land(game);
        var owner = game.Players[0];
        var spot = game.Walkable(game.MapCenter + new Vector2(1.6f, 0));
        var target = game.Spawn("rider", owner, spot);
        var beside = game.Spawn("rider", owner, spot + new Vector2(0, 0.8f));
        var far = game.Spawn("rider", owner, spot + new Vector2(0, 4f));
        foreach (var rider in new[] { target, beside, far })
        {
            rider.StunUntilTick = game.Tick + TestGames.Seconds(5);
        }
        // One quiet tick puts the new riders in the spatial index the splash searches.
        dragon.StunUntilTick = game.Tick + 2;
        game.Step([]);
        // Crowded riders overlap; the splash reaches only units pressed against its target.
        beside.Position = target.Position + new Vector2(0, game.Content.DragonUnit.Splash);
        dragon.Order = UnitOrder.Attack(target);

        game.Step([]);
        TestGames.Run(game, 3);

        target.Hp.Should().BeLessThan(target.MaxHp);
        beside.Hp.Should().Be(target.Hp, "the splash deals the full blow to every enemy in its radius");
        far.Hp.Should().Be(far.MaxHp);
    }

    /// <summary>Brings the landing to the next tick.</summary>
    private static void LandSoon(Game game)
    {
        game.Dragon.Lair.RespawnTick = game.Tick + 1;
    }

    private static Unit Land(Game game)
    {
        LandSoon(game);
        game.Step([]);
        return Dragons(game).Single();
    }

    private static List<Unit> Dragons(Game game)
    {
        return game.Entities.Units.Where(u => u.IsAlive && u.Def == game.Content.DragonUnit).ToList();
    }
}
