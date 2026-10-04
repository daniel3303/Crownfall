using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Systems;

/// <summary>Talent tiers open at fixed hero levels, take one of two options for good and outlast the hero's death.</summary>
public class HeroTalentTests
{
    [Fact]
    public void OpenTalentTier_FollowsTheTalentLevelsAndThePicks()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var levels = game.Content.Rules.HeroTalentLevels;

        LevelUp(game, player, levels[0] - 1);
        var beforeFirst = player.HeroState.OpenTalentTier;
        LevelUp(game, player, levels[1]);
        var bothOpen = player.HeroState.OpenTalentTier;
        Pick(game, player, 0, "bulwark");

        beforeFirst.Should().Be(-1);
        bothOpen.Should().Be(0, "the lowest open tier comes first");
        player.HeroState.OpenTalentTier.Should().Be(1);
    }

    [Fact]
    public void PickTalent_BeforeTheTierOpens_IsRefusedWithTheLevel()
    {
        var game = TestGames.Create();
        var player = game.Players[0];

        Pick(game, player, 0, "bulwark");

        player.HeroState.Talents[0].Should().BeNull();
        game.Events.OfType<NoticeEvent>().Should().Contain(n => n.Player == player.Index && n.Text.Contains($"level {game.Content.Rules.HeroTalentLevels[0]}"));
    }

    [Fact]
    public void PickTalent_FilledTier_KeepsTheFirstPick()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        LevelUp(game, player, game.Content.Rules.HeroTalentLevels[0]);

        Pick(game, player, 0, "bulwark");
        Pick(game, player, 0, "righteousCleave");

        player.HeroState.Talents[0].Id.Should().Be("bulwark");
    }

    [Fact]
    public void PickTalent_AnotherTiersOrHerosTalentOrAMissingTier_IsIgnored()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        LevelUp(game, player, 20);

        Pick(game, player, 0, "crusadersVigor");
        Pick(game, player, 0, "warDrums");
        Pick(game, player, 3, "holyBlade");
        Pick(game, player, -1, "holyBlade");

        player.HeroState.Talents.Should().OnlyContain(t => t == null);
    }

    [Fact]
    public void Talent_AbilityDamageAndRadius_CleaveHitsHarderAndFarther()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var hero = LevelUp(game, player, game.Content.Rules.HeroTalentLevels[0]);
        var cleave = game.Content.Ability("cleave");
        var talent = game.Content.Race("humans").HeroUnit.Talents[0].Single(t => t.Id == "righteousCleave");
        var plain = player.HeroState.AbilityDamage(cleave);

        Pick(game, player, 0, talent.Id);
        // Both stand stunned for the one tick that indexes the enemy, so neither walks into plain cleave range.
        var reach = cleave.Radius + talent.Radius / 2 + game.Content.Unit("spearman").Radius;
        var enemy = game.Spawn("spearman", game.Players[1], hero.Position + new Vector2(reach, 0));
        enemy.MaxHp = 5000;
        enemy.Hp = enemy.MaxHp;
        enemy.StunUntilTick = game.Tick + 100;
        hero.StunUntilTick = game.Tick + 2;
        game.Step([]);
        game.Issue(player, new AbilityCommand { Slot = TestGames.Slot(player, "cleave") });

        player.HeroState.AbilityDamage(cleave).Should().BeApproximately(plain * (1 + talent.AbilityDamage), 0.001f);
        player.HeroState.AbilityRadius(cleave).Should().Be(cleave.Radius + talent.Radius);
        enemy.Hp.Should().BeLessThan(enemy.MaxHp, "the wider cleave reaches an enemy past the plain radius");
    }

    [Fact]
    public void Talent_Cooldown_ShortensOnlyItsAbility()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        LevelUp(game, player, game.Content.Rules.HeroTalentLevels[1]);
        var rules = game.Content.Rules;
        var charge = game.Content.Ability("charge");
        var cleave = game.Content.Ability("cleave");
        var plainCharge = player.HeroState.AbilityCooldown(charge, rules);
        var plainCleave = player.HeroState.AbilityCooldown(cleave, rules);

        Pick(game, player, 0, "bulwark");
        Pick(game, player, 1, "relentlessCharge");

        var factor = rules.HeroCooldownFactor(player.HeroState.Level);
        player.HeroState.AbilityCooldown(charge, rules).Should().BeApproximately(plainCharge - 4 * factor, 0.001f);
        player.HeroState.AbilityCooldown(cleave, rules).Should().Be(plainCleave);
        player.HeroState.AbilityStun(charge).Should().Be(charge.Stun + 0.5f);
    }

    [Fact]
    public void Talent_Stun_ChargeHoldsEveryEnemyItHitsLonger()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var hero = LevelUp(game, player, game.Content.Rules.HeroTalentLevels[1]);
        Pick(game, player, 0, "bulwark");
        Pick(game, player, 1, "relentlessCharge");
        var charge = game.Content.Ability("charge");
        var line = OpenLine(game, hero, charge.Range);
        var enemy = game.Spawn("spearman", game.Players[1], hero.Position + line * 3);
        enemy.MaxHp = 5000;
        enemy.Hp = enemy.MaxHp;
        enemy.StunUntilTick = game.Tick + 2;
        hero.StunUntilTick = game.Tick + 2;
        game.Step([]);
        var target = hero.Position + line * charge.Range;

        game.Issue(player, new AbilityCommand { Slot = TestGames.Slot(player, "charge"), X = target.X, Y = target.Y });
        var castTick = game.Tick;
        TestGames.Run(game, TestGames.Seconds(1));

        enemy.Hp.Should().BeLessThan(enemy.MaxHp, "the charge runs through the enemy");
        enemy.StunUntilTick.Should().BeGreaterThanOrEqualTo(castTick + TestGames.Seconds(charge.Stun + 0.5f), "the talent's half second adds to the stun of each hit");
    }

    [Fact]
    public void Talent_Range_BlinkCarriesTheHeroFarther()
    {
        var game = TestGames.CreateWithHeroes("archmage");
        var player = game.Players[0];
        var hero = LevelUp(game, player, game.Content.Rules.HeroTalentLevels[1]);
        Pick(game, player, 0, "manaShield");
        Pick(game, player, 1, "quickBlink");
        var blink = game.Content.Ability("blink");
        var reach = blink.Range + game.Content.Unit("archmage").Talents[1].Single(t => t.Id == "quickBlink").Range;
        var line = OpenLine(game, hero, reach);
        var start = hero.Position;
        var far = start + line * (reach + 5);

        game.Issue(player, new AbilityCommand { Slot = TestGames.Slot(player, "blink"), X = far.X, Y = far.Y });
        TestGames.Run(game, TestGames.Seconds(1));

        Vector2.Distance(hero.Position, start).Should().BeApproximately(reach, 0.3f, "the aim is clamped to the range with the talent's extra reach");
    }

    [Fact]
    public void Talent_Health_GrowsALivingHeroAtOnce()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var hero = LevelUp(game, player, game.Content.Rules.HeroTalentLevels[1]);
        Pick(game, player, 0, "bulwark");
        var maxHp = hero.MaxHp;
        var hp = hero.Hp;

        Pick(game, player, 1, "crusadersVigor");

        hero.MaxHp.Should().Be(maxHp + 180);
        hero.Hp.Should().BeApproximately(hp + 180, 1f);
    }

    [Fact]
    public void Talents_SurviveDeathAndRevive()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var hero = LevelUp(game, player, game.Content.Rules.HeroTalentLevels[2]);
        var armor = hero.ArmorAgainst(DamageType.Melee);
        Pick(game, player, 0, "bulwark");
        Pick(game, player, 1, "crusadersVigor");
        Pick(game, player, 2, "holyBlade");
        var maxHp = hero.MaxHp;
        var attack = hero.AttackDamage;

        player.Stock.Add([5000, 5000, 5000, 5000]);
        game.Kill(hero, game.Players[1]);
        TestGames.Run(game, player.HeroState.ReviveTick - game.Tick);
        game.Issue(player, new ReviveHeroCommand());
        var revived = player.Hero;

        revived.Should().NotBeSameAs(hero);
        player.HeroState.Talents.Select(t => t.Id).Should().Equal("bulwark", "crusadersVigor", "holyBlade");
        revived.MaxHp.Should().Be(maxHp);
        revived.AttackDamage.Should().Be(attack);
        revived.ArmorAgainst(DamageType.Melee).Should().Be(armor + 2);
        player.HeroState.LifeSteal.Should().BeGreaterThanOrEqualTo(0.1f);
    }

    private static Unit LevelUp(Game game, Player player, int level)
    {
        game.Heroes.AddXp(player, game.Content.Rules.HeroXpForLevel(level) - player.HeroState.Xp);
        player.Hero.Position = game.QuietSpot();
        game.Step([]);
        return player.Hero;
    }

    /// <summary>One of eight directions along which the hero can travel <paramref name="length"/> tiles and one more on open ground.</summary>
    private static Vector2 OpenLine(Game game, Unit hero, float length)
    {
        for (var i = 0; i < 8; i++)
        {
            var angle = i * MathF.PI / 4;
            var direction = new Vector2(MathF.Cos(angle), MathF.Sin(angle));
            var open = true;
            for (var step = 0f; step <= length + 1 && open; step += 0.2f)
            {
                open = game.Map.IsWalkable(hero.Position + direction * step, hero.Team);
            }
            if (open)
            {
                return direction;
            }
        }
        throw new InvalidOperationException("No open line around the hero.");
    }

    private static void Pick(Game game, Player player, int tier, string talent)
    {
        game.Issue(player, new PickTalentCommand { Tier = tier, Talent = talent });
    }
}
