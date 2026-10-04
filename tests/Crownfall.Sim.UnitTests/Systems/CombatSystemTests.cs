using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Systems;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Systems;

public class CombatSystemTests
{
    [Fact]
    public void ComputeDamage_SpearmanAgainstRider_AddsCavalryBonus()
    {
        var game = TestGames.Create();
        var spearman = game.Content.Unit("spearman");
        var rider = game.Spawn("rider", game.Players[1], game.MapCenter);

        var damage = CombatSystem.ComputeDamage(spearman.Attack, spearman.DamageType, spearman.Bonus, rider);

        damage.Should().Be(6 - 1 + 14);
    }

    [Fact]
    public void ComputeDamage_ArmorAboveAttack_StillDealsOne()
    {
        var game = TestGames.Create();
        var villager = game.Content.Unit("villager");
        var townCenter = game.TownCenter(game.Players[1]);

        CombatSystem.ComputeDamage(villager.Attack, villager.DamageType, villager.Bonus, townCenter).Should().Be(1);
    }

    [Fact]
    public void Attack_ArcherKillsVillager_CreditsKillerAndRemovesVictim()
    {
        var game = TestGames.Create();
        var attacker = game.Players[0];
        var spot = game.QuietSpot();
        var archer = game.Spawn("archer", attacker, spot);
        var victim = game.Spawn("villager", game.Players[1], spot + new Vector2(3, 0));
        game.Step([]);

        game.Issue(attacker, new AttackCommand { Units = [archer.Id], Target = victim.Id });
        TestGames.Run(game, TestGames.Seconds(20));

        victim.IsAlive.Should().BeFalse();
        attacker.Stats.Kills.Should().Be(1);
        game.Players[1].Stats.Losses.Should().Be(1);
    }

    [Fact]
    public void Cleave_DamagesNearbyEnemiesButNotAllies()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var hero = player.Hero;
        hero.Position = game.QuietSpot();
        var enemy = game.Spawn("spearman", game.Players[1], hero.Position + new Vector2(1.2f, 0));
        var ally = game.Spawn("spearman", player, hero.Position + new Vector2(-1.2f, 0));
        game.Step([]);
        var enemyHp = enemy.Hp;

        game.Issue(player, new AbilityCommand { Slot = 0 });

        enemy.Hp.Should().BeLessThan(enemyHp);
        ally.Hp.Should().Be(ally.MaxHp);
        player.HeroState.Cooldowns[0].Should().BeGreaterThan(0);
    }

    [Fact]
    public void Ability_BeforeUnlockLevel_DoesNothing()
    {
        var game = TestGames.Create();
        var player = game.Players[0];

        var doomfall = TestGames.Slot(player, "doomfall");

        game.Issue(player, new AbilityCommand { Slot = doomfall, X = player.Hero.Position.X, Y = player.Hero.Position.Y });

        player.HeroState.Cooldowns[doomfall].Should().Be(0);
        game.Combat.Strikes.Should().BeEmpty();
    }
}
