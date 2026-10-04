using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.UnitTests.Support;
using Crownfall.Sim.World;

namespace Crownfall.Sim.UnitTests.Systems;

public class HeroSystemTests
{
    [Fact]
    public void Regen_BeforeDelay_DoesNotHeal()
    {
        var (game, hero) = WoundedHero();

        TestGames.Run(game, DelayTicks(game) - 1);

        hero.Hp.Should().Be(100);
    }

    [Fact]
    public void Regen_AfterDelay_HealsAtTheRuleRate()
    {
        var (game, hero) = WoundedHero();
        TestGames.Run(game, DelayTicks(game) - 1);

        TestGames.Run(game, TestGames.Seconds(2));

        var expected = 100 + hero.MaxHp * game.Content.Rules.HeroRegenPerSecond * 2;
        hero.Hp.Should().BeApproximately(expected, 0.5f);
    }

    [Fact]
    public void Regen_StopsAtMaxHp()
    {
        var (game, hero) = WoundedHero();

        TestGames.Run(game, TestGames.Seconds(60));

        hero.Hp.Should().Be(hero.MaxHp);
    }

    [Fact]
    public void Regen_TakingDamage_StopsItUntilTheDelayPassesAgain()
    {
        var (game, hero) = WoundedHero();
        TestGames.Run(game, DelayTicks(game) + TestGames.Seconds(1));

        game.Combat.Damage(hero, 10, null, game.Players[1]);
        var afterHit = hero.Hp;
        TestGames.Run(game, DelayTicks(game) - 1);

        hero.Hp.Should().Be(afterHit);
    }

    [Fact]
    public void AddXp_EachLevelGained_GrantsOnePoint()
    {
        var game = TestGames.Create();
        var player = game.Players[0];

        game.Heroes.AddXp(player, game.Content.Rules.HeroXpForLevel(4));

        player.HeroState.Level.Should().Be(4);
        player.HeroState.UnspentPoints.Should().Be(3);
    }

    [Fact]
    public void AddXp_EachLevel_GrowsHealthAndAttackMoreThanTheOneBefore()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var hero = player.Hero;
        var hpGains = new List<float>();
        var attackGains = new List<float>();

        for (var level = 2; level <= 7; level++)
        {
            var hpBefore = hero.MaxHp;
            var attackBefore = hero.AttackDamage;
            game.Heroes.AddXp(player, game.Content.Rules.HeroXpForLevel(level) - player.HeroState.Xp);
            hpGains.Add(hero.MaxHp - hpBefore);
            attackGains.Add(hero.AttackDamage - attackBefore);
        }

        hpGains.Should().BeInAscendingOrder().And.OnlyHaveUniqueItems();
        attackGains.Should().BeInAscendingOrder().And.OnlyHaveUniqueItems();
        hero.MaxHp.Should().BeApproximately(hero.Def.Hp + player.HeroState.BonusHp, 0.01f, "a hero revived at this level comes back just as big");
    }

    [Fact]
    public void AddXp_PastTheTable_KeepsLevelingWithGrowingSteps()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var rules = game.Content.Rules;
        var tableLevels = rules.HeroXpLevels.Count;

        game.Heroes.AddXp(player, rules.HeroXpForLevel(tableLevels + 3));

        player.HeroState.Level.Should().Be(tableLevels + 3);
        player.HeroState.UnspentPoints.Should().Be(tableLevels + 2);
        var steps = Enumerable.Range(tableLevels - 1, 5).Select(level => rules.HeroXpForLevel(level + 1) - rules.HeroXpForLevel(level)).ToList();
        steps.Should().BeInAscendingOrder().And.OnlyHaveUniqueItems();
        (steps[^1] - steps[^2]).Should().Be(rules.HeroXpStepGrowth);
    }

    [Fact]
    public void HeroStat_WithoutAPoint_IsRefused()
    {
        var game = TestGames.Create();
        var player = game.Players[0];

        game.Issue(player, new HeroStatCommand { Stat = "attackDamage" });

        player.HeroState.Ranks.Should().OnlyContain(r => r == 0);
    }

    [Fact]
    public void HeroStat_UnknownStat_KeepsThePoint()
    {
        var (game, player) = LeveledPlayer(points: 1);

        game.Issue(player, new HeroStatCommand { Stat = "flight" });

        player.HeroState.UnspentPoints.Should().Be(1);
        player.HeroState.Ranks.Should().OnlyContain(r => r == 0);
    }

    [Fact]
    public void HeroStat_AttackDamage_AddsPerRankToEveryHit()
    {
        var (game, player) = LeveledPlayer(points: 2);
        var before = player.Hero.AttackDamage;

        Learn(game, player, "attackDamage", 2);

        player.Hero.AttackDamage.Should().Be(before + 2 * PerRank(game, "attackDamage"));
    }

    [Fact]
    public void HeroStat_AttackSpeed_ShortensTheCooldown()
    {
        var (game, player) = LeveledPlayer(points: 1);
        var hero = player.Hero;

        Learn(game, player, "attackSpeed", 1);

        hero.CooldownAt(game.Tick).Should().BeApproximately(hero.Def.Cooldown / (1 + PerRank(game, "attackSpeed")), 0.0001f);
    }

    [Fact]
    public void HeroStat_AttackSpeedWithRally_BonusesAddUp()
    {
        var (game, player) = LeveledPlayer(points: 1);
        var hero = player.Hero;
        var rally = game.Content.Abilities.First(a => a.Id == "rally");
        Learn(game, player, "attackSpeed", 1);

        hero.Buff = rally;
        hero.BuffUntilTick = game.Tick + 100;

        var expected = hero.Def.Cooldown / (1 + rally.AttackSpeedBonus + PerRank(game, "attackSpeed"));
        hero.CooldownAt(game.Tick).Should().BeApproximately(expected, 0.0001f);
    }

    [Fact]
    public void HeroStat_MoveSpeed_ScalesSpeed()
    {
        var (game, player) = LeveledPlayer(points: 3);
        var hero = player.Hero;

        Learn(game, player, "moveSpeed", 3);

        hero.SpeedAt(game.Tick).Should().BeApproximately(hero.Def.Speed * (1 + 3 * PerRank(game, "moveSpeed")), 0.0001f);
    }

    [Fact]
    public void HeroStat_MaxHealth_RaisesMaxAndCurrentHp()
    {
        var (game, player) = LeveledPlayer(points: 1);
        var hero = player.Hero;
        hero.Hp = 100;
        hero.LastDamagedTick = game.Tick;
        var maxBefore = hero.MaxHp;

        Learn(game, player, "maxHealth", 1);

        hero.MaxHp.Should().Be(maxBefore + PerRank(game, "maxHealth"));
        hero.Hp.Should().Be(100 + PerRank(game, "maxHealth"));
    }

    [Fact]
    public void HeroStat_LifeSteal_HealsAShareOfDamageDealt()
    {
        var (game, player) = LeveledPlayer(points: 2);
        var hero = player.Hero;
        Learn(game, player, "lifeSteal", 2);
        var target = game.Spawn("troll", null, hero.Position + new Vector2(0.8f, 0));
        hero.Hp = 100;
        var targetHp = target.Hp;

        game.Combat.Attack(hero, target);

        var dealt = targetHp - target.Hp;
        hero.Hp.Should().BeApproximately(100 + dealt * 2 * PerRank(game, "lifeSteal"), 0.001f);
    }

    [Fact]
    public void HeroStat_LifeSteal_OverkillDoesNotCount()
    {
        var (game, player) = LeveledPlayer(points: 1);
        var hero = player.Hero;
        Learn(game, player, "lifeSteal", 1);
        var target = game.Spawn("wolf", null, hero.Position + new Vector2(0.8f, 0));
        target.Hp = 2;
        hero.Hp = 100;

        game.Combat.Attack(hero, target);

        target.IsAlive.Should().BeFalse();
        hero.Hp.Should().BeApproximately(100 + 2 * PerRank(game, "lifeSteal"), 0.001f);
    }

    [Fact]
    public void HeroStat_Ranks_SurviveDeathAndRevive()
    {
        var (game, player) = LeveledPlayer(points: 2);
        Learn(game, player, "maxHealth", 1);
        Learn(game, player, "attackDamage", 1);
        var maxHp = player.Hero.MaxHp;
        var attack = player.Hero.AttackDamage;

        var revived = KillAndRevive(game, player);

        revived.MaxHp.Should().Be(maxHp);
        revived.AttackDamage.Should().Be(attack);
        player.HeroState.Ranks.Sum().Should().Be(2);
    }

    [Fact]
    public void Death_ByAnEnemy_PaysTheKillerGoldThatGrowsWithTheHerosLevel()
    {
        var game = TestGames.Create();
        var victim = game.Players[0];
        var killer = game.Players[1];
        var rules = game.Content.Rules;
        game.Heroes.AddXp(victim, rules.HeroXpForLevel(5));
        var before = killer.Stock[ResourceType.Gold];

        game.Kill(victim.Hero, killer);

        killer.Stock[ResourceType.Gold].Should().Be(before + rules.HeroKillGold + rules.HeroKillGoldPerLevel * 4);
        game.Heroes.KillGold(5).Should().BeGreaterThan(game.Heroes.KillGold(1));
        game.Heroes.KillGold(1).Should().Be(rules.HeroKillGold);
    }

    [Fact]
    public void Death_WithoutAnEnemyKiller_PaysNoGold()
    {
        var game = TestGames.Create(perTeam: 2);
        var victim = game.Players[0];
        var ally = game.Players.First(p => p != victim && p.Team == victim.Team);
        var stock = game.Players.Select(p => p.Stock[ResourceType.Gold]).ToList();

        game.Kill(victim.Hero, ally);
        game.Kill(ally.Hero, null);

        game.Players.Select(p => p.Stock[ResourceType.Gold]).Should().Equal(stock);
    }

    [Fact]
    public void Death_AfterCooldown_DoesNotRespawnByItself()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        game.Kill(player.Hero, game.Players[1]);

        TestGames.Run(game, TestGames.Seconds(60));

        player.Hero.Should().BeNull();
        game.Heroes.CanRevive(player).Should().BeTrue();
    }

    [Fact]
    public void Revive_WithShallowsBelowTheTownCenter_StandsOnDryGround()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var rect = game.Entities.Buildings.Single(b => b.Owner == player && b.Def.Id == "townCenter").Rect;
        for (var y = rect.Y + rect.Height; y < rect.Y + rect.Height + 3; y++)
        {
            for (var x = rect.X - 1; x <= rect.X + rect.Width; x++)
            {
                game.Map.SetTile(x, y, TileType.Shallow);
            }
        }

        var hero = KillAndRevive(game, player);

        game.Map.IsShallow((int)MathF.Floor(hero.Position.X), (int)MathF.Floor(hero.Position.Y)).Should().BeFalse();
    }

    [Fact]
    public void Revive_DuringCooldown_IsRefused()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        Fund(player);
        game.Kill(player.Hero, game.Players[1]);
        var stock = player.Stock.Snapshot();

        game.Issue(player, new ReviveHeroCommand());

        player.Hero.Should().BeNull();
        player.Stock.Snapshot().Should().Equal(stock);
    }

    [Fact]
    public void Revive_WithoutResources_IsRefused()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        game.Kill(player.Hero, game.Players[1]);
        AwaitCooldown(game, player);
        player.Stock.TrySpend(player.Stock.Snapshot());

        game.Issue(player, new ReviveHeroCommand());

        player.Hero.Should().BeNull();
    }

    [Fact]
    public void Revive_WithoutATownCenter_IsRefused()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        Fund(player);
        game.Kill(player.Hero, game.Players[1]);
        AwaitCooldown(game, player);
        game.Kill(game.TownCenter(player), game.Players[1]);
        var stock = player.Stock.Snapshot();

        game.Issue(player, new ReviveHeroCommand());

        player.Hero.Should().BeNull();
        player.Stock.Snapshot().Should().Equal(stock);
    }

    [Fact]
    public void Revive_ChargesTheLevelPriceAndKeepsProgress()
    {
        var (game, player) = LeveledPlayer(points: 3);
        Learn(game, player, "lifeSteal", 1);
        Fund(player);
        var state = player.HeroState;
        var (level, xp) = (state.Level, state.Xp);
        var cost = game.Content.HeroReviveCost(level);
        game.Kill(player.Hero, game.Players[1]);
        AwaitCooldown(game, player);
        var before = player.Stock.Snapshot();

        game.Issue(player, new ReviveHeroCommand());

        player.Hero.Should().NotBeNull();
        player.Stock.Snapshot().Should().Equal(before.Select((amount, i) => amount - cost[i]));
        (state.Level, state.Xp, state.UnspentPoints).Should().Be((level, xp, 2));
        state.Ranks[game.Content.HeroStatIndex("lifeSteal")].Should().Be(1);
        game.TownCenter(player).EdgeDistance(player.Hero.Position).Should().BeLessThan(3);
    }

    [Fact]
    public void Revive_OfAHeroPricedAboveStorage_CostsAtMostAFullStore()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        player.HeroState.Level = 40;
        game.Kill(player.Hero, game.Players[1]);
        AwaitCooldown(game, player);
        var caps = player.Stock.Caps();
        player.Stock.TrySpend(player.Stock.Snapshot());
        player.Stock.Add(caps);

        game.Issue(player, new ReviveHeroCommand());

        game.Content.HeroReviveCost(40).Zip(caps).Should().Contain(pair => pair.First > pair.Second, "the uncapped price must outgrow storage for this test");
        player.Hero.Should().NotBeNull();
    }

    [Fact]
    public void ReviveCost_RisesWithLevel()
    {
        var content = TestGames.Content;

        var first = Resources.Total(content.HeroReviveCost(1));
        var fifth = Resources.Total(content.HeroReviveCost(5));
        var tenth = Resources.Total(content.HeroReviveCost(10));

        first.Should().BeLessThan(fifth);
        fifth.Should().BeLessThan(tenth);
        content.StartingResources.Select((amount, i) => amount >= content.HeroReviveCost(1)[i]).Should().OnlyContain(ok => ok);
    }

    [Fact]
    public void ReviveCost_EachLevelAddsMoreThanTheOneBefore()
    {
        var content = TestGames.Content;
        var totals = Enumerable.Range(1, 20).Select(level => Resources.Total(content.HeroReviveCost(level))).ToList();

        var steps = totals.Zip(totals.Skip(1), (lower, higher) => higher - lower).ToList();

        steps.Should().BeInAscendingOrder("the revive price should climb faster at every level, not by a flat step");
        steps[^1].Should().BeGreaterThan(2 * steps[0]);
        content.HeroReviveCost(1).Should().Equal(Resources.FromDictionary(content.Rules.HeroReviveCost));
    }

    [Fact]
    public void ReviveCost_AtLevelFive_IsTheBaseAndFourStepsCompoundedFourTimes()
    {
        // food (100 + 4 × 25) × 1.06⁴ = 252.5 and gold (50 + 4 × 30) × 1.06⁴ = 214.6, with game.json's numbers.
        TestGames.Content.HeroReviveCost(5).Should().Equal(252, 0, 0, 215);
    }

    private static (Game Game, Unit Hero) WoundedHero()
    {
        var game = TestGames.Create();
        var hero = game.Players[0].Hero;
        hero.Position = game.QuietSpot();
        game.Step([]);
        hero.Hp = 100;
        hero.LastDamagedTick = game.Tick;
        return (game, hero);
    }

    private static (Game Game, Player Player) LeveledPlayer(int points)
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        player.Hero.Position = game.QuietSpot();
        game.Heroes.AddXp(player, game.Content.Rules.HeroXpForLevel(points + 1));
        game.Step([]);
        return (game, player);
    }

    private static void Learn(Game game, Player player, string stat, int times)
    {
        for (var i = 0; i < times; i++)
        {
            game.Issue(player, new HeroStatCommand { Stat = stat });
        }
    }

    private static Unit KillAndRevive(Game game, Player player)
    {
        Fund(player);
        game.Kill(player.Hero, game.Players[1]);
        AwaitCooldown(game, player);
        game.Issue(player, new ReviveHeroCommand());
        return player.Hero;
    }

    private static void AwaitCooldown(Game game, Player player)
    {
        TestGames.Run(game, player.HeroState.ReviveTick - game.Tick);
    }

    private static void Fund(Player player)
    {
        player.Stock.Add([2000, 2000, 2000, 2000]);
    }

    private static float PerRank(Game game, string stat)
    {
        return game.Content.HeroStats[game.Content.HeroStatIndex(stat)].PerRank;
    }

    private static int DelayTicks(Game game)
    {
        return TestGames.Seconds(game.Content.Rules.HeroRegenDelaySeconds);
    }
}
