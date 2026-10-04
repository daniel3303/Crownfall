using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Entities;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Systems;

public class AbilitySystemTests
{
    [Fact]
    public void Charge_RushesToThePointAndStunsEnemiesOnTheWay()
    {
        var (game, player, slot) = ChargeReady();
        var hero = player.Hero;
        var start = hero.Position;
        var enemy = game.Spawn("spearman", game.Players[1], start + new Vector2(3, 0));
        game.Step([]);
        var enemyHp = enemy.Hp;

        game.Issue(player, new AbilityCommand { Slot = slot, X = start.X + 5, Y = start.Y });
        TestGames.Run(game, 4);

        Vector2.Distance(hero.Position, start + new Vector2(5, 0)).Should().BeLessThan(0.6f);
        hero.Dash.Should().BeNull();
        enemy.Hp.Should().BeLessThan(enemyHp);
        enemy.IsStunned(game.Tick).Should().BeTrue();
    }

    [Fact]
    public void Charge_BeyondRange_StopsAtTheRange()
    {
        var (game, player, slot) = ChargeReady();
        var hero = player.Hero;
        var start = hero.Position;
        var charge = player.HeroState.Kit[slot];

        game.Issue(player, new AbilityCommand { Slot = slot, X = start.X, Y = start.Y + 40 });
        TestGames.Run(game, 10);

        Vector2.Distance(hero.Position, start).Should().BeLessThanOrEqualTo(charge.Range + 0.5f);
        Vector2.Distance(hero.Position, start).Should().BeGreaterThan(charge.Range - 1.5f);
    }

    [Fact]
    public void Stun_StopsAUnitFromAttacking()
    {
        var game = TestGames.Create();
        var spot = game.QuietSpot();
        var attacker = game.Spawn("spearman", game.Players[0], spot);
        var victim = game.Spawn("villager", game.Players[1], spot + new Vector2(0.8f, 0));
        game.Step([]);
        attacker.StunUntilTick = game.Tick + TestGames.Seconds(3);

        game.Issue(game.Players[0], new AttackCommand { Units = [attacker.Id], Target = victim.Id });
        TestGames.Run(game, TestGames.Seconds(2));

        victim.Hp.Should().Be(victim.MaxHp);
    }

    [Fact]
    public void Charge_BeforeItUnlocks_IsRefused()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var slot = TestGames.Slot(player, "charge");
        var start = player.Hero.Position;

        game.Issue(player, new AbilityCommand { Slot = slot, X = start.X + 5, Y = start.Y });

        player.Hero.Dash.Should().BeNull();
        player.HeroState.Cooldowns[slot].Should().Be(0);
    }

    [Fact]
    public void Cast_AtAHigherLevel_RechargesSooner()
    {
        var (game, player, slot) = ChargeReady();
        var ability = player.HeroState.Kit[slot];
        var rules = game.Content.Rules;
        game.Heroes.AddXp(player, rules.HeroXpForLevel(ability.UnlockLevel + 5) - player.HeroState.Xp);
        var start = player.Hero.Position;

        game.Issue(player, new AbilityCommand { Slot = slot, X = start.X + 5, Y = start.Y });

        var reduced = ability.Cooldown * rules.HeroCooldownFactor(player.HeroState.Level);
        reduced.Should().BeLessThan(ability.Cooldown * rules.HeroCooldownFactor(ability.UnlockLevel));
        player.HeroState.Cooldowns[slot].Should().BeApproximately(reduced, game.Dt + 0.001f);
    }

    [Fact]
    public void CooldownFactor_ShrinksWithLevelDownToTheCap()
    {
        var rules = TestGames.Content.Rules;

        rules.HeroCooldownFactor(1).Should().Be(1);
        rules.HeroCooldownFactor(3).Should().BeLessThan(rules.HeroCooldownFactor(2));
        rules.HeroCooldownFactor(1000).Should().BeApproximately(1 - rules.HeroCooldownReductionMax, 0.0001f);
    }

    private static (Game Game, Player Player, int Slot) ChargeReady()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var slot = TestGames.Slot(player, "charge");
        game.Heroes.AddXp(player, game.Content.Rules.HeroXpForLevel(player.HeroState.Kit[slot].UnlockLevel));
        player.Hero.Position = game.QuietSpot();
        game.Step([]);
        return (game, player, slot);
    }
}
