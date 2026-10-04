using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Systems;

/// <summary>Each hero casts its own four abilities, and the effects only the new heroes use behave as their text says.</summary>
public class HeroKitTests
{
    [Fact]
    public void Kit_PickedHero_CastsItsOwnAbilityFromEachSlot()
    {
        var game = TestGames.CreateWithHeroes("archmage");
        var player = game.Players[0];
        player.Hero.Position = game.QuietSpot();
        game.Step([]);

        game.Issue(player, new AbilityCommand { Slot = 0, X = player.Hero.Position.X + 4, Y = player.Hero.Position.Y });

        player.HeroState.Kit.Select(a => a.Id).Should().Equal("fireball", "arcaneWard", "blink", "meteor");
        game.Combat.Strikes.Should().ContainSingle(s => s.Ability.Id == "fireball");
        player.HeroState.Cooldowns[0].Should().BeApproximately(game.Content.Ability("fireball").Cooldown - game.Dt, 0.001f);
    }

    [Fact]
    public void Kit_SlotPastTheKit_DoesNothing()
    {
        var game = TestGames.CreateWithHeroes("ranger");
        var player = game.Players[0];

        game.Issue(player, new AbilityCommand { Slot = player.HeroState.Kit.Count, X = 10, Y = 10 });

        player.HeroState.Cooldowns.Should().OnlyContain(c => c == 0);
        game.Combat.Strikes.Should().BeEmpty();
    }

    [Fact]
    public void Kit_EachHero_KeepsCooldownsForItsOwnAbilities()
    {
        var game = TestGames.CreateWithHeroes("paladin", "blademaster");
        var paladin = game.Players[0];
        var blademaster = game.Players[1];
        paladin.Hero.Position = game.QuietSpot();
        game.Step([]);

        game.Step([new CommandEnvelope(paladin.Index, new AbilityCommand { Slot = 0 }), new CommandEnvelope(blademaster.Index, new AbilityCommand { Slot = 0 })]);

        paladin.HeroState.Cooldowns[0].Should().BeApproximately(game.Content.Ability("cleave").Cooldown - game.Dt, 0.001f);
        blademaster.HeroState.Cooldowns[0].Should().BeApproximately(game.Content.Ability("whirlwind").Cooldown - game.Dt, 0.001f);
    }

    [Fact]
    public void Heal_RestoresTheHeroAndNearbyAlliesUpToTheirMaxButNoEnemy()
    {
        var game = TestGames.CreateWithHeroes("paladin", "shaman");
        var player = game.Players[1];
        var hero = LevelUp(game, player, 2);
        var ally = game.Spawn("spearman", player, hero.Position + new Vector2(2, 0));
        var nearlyFull = game.Spawn("spearman", player, hero.Position + new Vector2(-2, 0));
        var distant = game.Spawn("spearman", player, hero.Position + new Vector2(0, 12));
        var enemy = game.Spawn("spearman", game.Players[0], hero.Position + new Vector2(0, 2));
        game.Step([]);
        hero.Hp = 100;
        hero.LastDamagedTick = game.Tick;
        var hurtAt = game.Tick;
        ally.Hp = 10;
        nearlyFull.Hp = nearlyFull.MaxHp - 5;
        distant.Hp = 10;
        enemy.Hp = 10;
        var heal = player.HeroState.AbilityHeal(game.Content.Ability("healingWave"));

        game.Issue(player, new AbilityCommand { Slot = TestGames.Slot(player, "healingWave") });

        heal.Should().Be(game.Content.Ability("healingWave").HealAt(2));
        hero.Hp.Should().Be(100 + heal);
        ally.Hp.Should().Be(10 + heal);
        nearlyFull.Hp.Should().Be(nearlyFull.MaxHp);
        distant.Hp.Should().Be(10);
        enemy.Hp.Should().BeLessThanOrEqualTo(10);
        hero.LastDamagedTick.Should().Be(hurtAt, "a heal is not damage, so it does not delay the hero's rest");
    }

    [Fact]
    public void Blink_MovesTheHeroWithoutHurtingOrStunningAnyoneOnTheWay()
    {
        var game = TestGames.CreateWithHeroes("archmage");
        var player = game.Players[0];
        var hero = LevelUp(game, player, 2);
        var enemy = game.Spawn("spearman", game.Players[1], hero.Position + new Vector2(2, 0));
        game.Step([]);
        var start = hero.Position;

        game.Issue(player, new AbilityCommand { Slot = TestGames.Slot(player, "blink"), X = start.X + 5, Y = start.Y });
        var dash = hero.Dash;
        TestGames.Run(game, 2);

        dash.Damage.Should().Be(0);
        dash.Hits.Should().BeEmpty("a blink touches no one on its way");
        Vector2.Distance(hero.Position, start + new Vector2(5, 0)).Should().BeLessThan(0.6f);
        hero.Dash.Should().BeNull();
        enemy.IsStunned(game.Tick).Should().BeFalse();
    }

    [Fact]
    public void Meteor_StunsEveryEnemyItLandsOn()
    {
        var game = TestGames.CreateWithHeroes("archmage");
        var player = game.Players[0];
        var hero = LevelUp(game, player, 6);
        var target = hero.Position + new Vector2(5, 0);
        var enemy = game.Spawn("spearman", game.Players[1], target);
        game.Step([]);
        enemy.MaxHp = 5000;
        enemy.Hp = enemy.MaxHp;
        var meteor = game.Content.Ability("meteor");

        game.Issue(player, new AbilityCommand { Slot = TestGames.Slot(player, "meteor"), X = target.X, Y = target.Y });
        TestGames.Run(game, TestGames.Seconds(meteor.Delay) + 1);

        enemy.Hp.Should().BeLessThan(enemy.MaxHp);
        enemy.IsStunned(game.Tick).Should().BeTrue();
    }

    [Fact]
    public void ArcaneWard_AddsArmorToAlliesUntilItEnds()
    {
        var game = TestGames.CreateWithHeroes("archmage");
        var player = game.Players[0];
        var hero = LevelUp(game, player, 3);
        var ally = game.Spawn("spearman", player, hero.Position + new Vector2(2, 0));
        game.Step([]);
        var before = ally.ArmorAgainst(DamageType.Pierce);
        var ward = game.Content.Ability("arcaneWard");

        game.Issue(player, new AbilityCommand { Slot = TestGames.Slot(player, "arcaneWard") });

        ally.ArmorAgainst(DamageType.Pierce).Should().Be(before + ward.ArmorBonus);
        TestGames.Run(game, TestGames.Seconds(ward.Duration) + 1);
        ally.ArmorAgainst(DamageType.Pierce).Should().Be(before, "the ward's armor ends with the buff");
    }

    [Fact]
    public void BattleCry_RaisesTheAttackOfAlliesItReaches()
    {
        var game = TestGames.CreateWithHeroes("paladin", "blademaster");
        var player = game.Players[1];
        var hero = LevelUp(game, player, 3);
        var ally = game.Spawn("spearman", player, hero.Position + new Vector2(2, 0));
        game.Step([]);
        var before = ally.AttackDamage;

        game.Issue(player, new AbilityCommand { Slot = TestGames.Slot(player, "battleCry") });

        ally.AttackDamage.Should().BeApproximately(before * (1 + game.Content.Ability("battleCry").AttackBonus), 0.001f);
    }

    /// <summary>Raises the player's hero to a level on a quiet spot and returns it.</summary>
    private static Unit LevelUp(Game game, Player player, int level)
    {
        game.Heroes.AddXp(player, game.Content.Rules.HeroXpForLevel(level) - player.HeroState.Xp);
        player.Hero.Position = game.QuietSpot();
        game.Step([]);
        return player.Hero;
    }
}
