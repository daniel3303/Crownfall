using System.Numerics;
using Crownfall.Sim.Bots;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Bots;

/// <summary>One think of a Hard bot's hero pilot, so the abilities only the new heroes carry are used as their kits intend.</summary>
public class BotHeroPilotTests
{
    [Fact]
    public void Escape_HurtArchmageInTheOpen_BlinksTowardHome()
    {
        var game = TestGames.CreateWithHeroes("archmage");
        var player = game.Players[0];
        var home = game.TownCenter(player).Position;
        var spot = game.Walkable(BotBuilder.Toward(home, game.MapCenter, 12));

        var hero = HurtHeroBeside(game, player, spot, BotBuilder.Toward(spot, home, -2.5f));
        Pilot(game, player).Run(BotView.Capture(game, player, new HashSet<int>()), BotMode.Attacking, wantsShop: false);

        hero.Dash.Should().NotBeNull("an open path home is worth the blink");
        Vector2.Distance(hero.Dash.Target, home).Should().BeLessThan(Vector2.Distance(spot, home));
    }

    [Fact]
    public void Escape_BlinkRefusedByAWallOnTheWayHome_WalksAwayInstead()
    {
        var game = TestGames.CreateWithHeroes("archmage");
        var player = game.Players[0];
        var townCenter = game.TownCenter(player);
        // Half a tile off the town center's edge, the blink toward its middle has no room and is refused.
        var spot = new Vector2(townCenter.Footprint.X + townCenter.Footprint.Width + 0.5f, townCenter.Position.Y);

        var hero = HurtHeroBeside(game, player, spot, spot + new Vector2(2.5f, 0));
        Pilot(game, player).Run(BotView.Capture(game, player, new HashSet<int>()), BotMode.Attacking, wantsShop: false);

        hero.Dash.Should().BeNull();
        player.HeroState.Cooldowns[TestGames.Slot(player, "blink")].Should().Be(0, "a refused blink costs nothing");
        hero.Order.Type.Should().Be(OrderType.Move, "a hero whose blink was refused must still run");
    }

    [Fact]
    public void Heal_AlliesAroundTheShamanHurt_CastsHealingWave()
    {
        var game = TestGames.CreateWithHeroes("paladin", "shaman");
        var player = game.Players[1];
        var allies = AlliesAroundLevelTwoHero(game, player);
        foreach (var ally in allies)
        {
            ally.Hp = 10;
        }

        Pilot(game, player).Run(BotView.Capture(game, player, new HashSet<int>()), BotMode.Building, wantsShop: false);

        player.HeroState.Cooldowns[TestGames.Slot(player, "healingWave")].Should().BeGreaterThan(0);
        allies.Should().OnlyContain(a => a.Hp > 10);
    }

    [Fact]
    public void Heal_EveryoneAroundTheShamanHealthy_KeepsHealingWaveReady()
    {
        var game = TestGames.CreateWithHeroes("paladin", "shaman");
        var player = game.Players[1];
        AlliesAroundLevelTwoHero(game, player);

        Pilot(game, player).Run(BotView.Capture(game, player, new HashSet<int>()), BotMode.Building, wantsShop: false);

        player.HeroState.Cooldowns[TestGames.Slot(player, "healingWave")].Should().Be(0);
    }

    private static BotHeroPilot Pilot(Game game, Player player)
    {
        var profile = BotProfile.For(BotDifficulty.Hard);
        var memory = new BotMemory(game, player, profile, new BotCombatModel(game.Content));
        return new BotHeroPilot(game, player, profile, memory);
    }

    /// <summary>
    /// A level 2 hero below the retreat health at <paramref name="spot"/> with an enemy archer at <paramref name="enemyAt"/>;
    /// a ranged enemy never counts as a chaser, so the hero tries to escape rather than fight.
    /// </summary>
    private static Unit HurtHeroBeside(Game game, Player player, Vector2 spot, Vector2 enemyAt)
    {
        game.Heroes.AddXp(player, game.Content.Rules.HeroXpForLevel(2) - player.HeroState.Xp);
        var hero = player.Hero;
        hero.Position = spot;
        var enemy = game.Spawn("archer", game.Players[1], enemyAt);
        enemy.StunUntilTick = game.Tick + 100;
        hero.StunUntilTick = game.Tick + 1;
        game.Step([]);
        hero.Hp = hero.MaxHp * 0.2f;
        return hero;
    }

    /// <summary>Raises the hero to level 2 on a quiet spot with three of its soldiers next to it, all at full health.</summary>
    private static List<Unit> AlliesAroundLevelTwoHero(Game game, Player player)
    {
        game.Heroes.AddXp(player, game.Content.Rules.HeroXpForLevel(2) - player.HeroState.Xp);
        var hero = player.Hero;
        hero.Position = game.QuietSpot();
        var allies = Enumerable.Range(0, 3).Select(i => game.Spawn("spearman", player, hero.Position + new Vector2(i - 1, 1.5f))).ToList();
        game.Step([]);
        return allies;
    }
}
