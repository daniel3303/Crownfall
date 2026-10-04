using System.Numerics;
using Crownfall.Sim.Bots;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Systems;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Bots;

/// <summary>One think of a bot's hero pilot, Hard unless a test says otherwise, so each hero behavior can be provoked on its own.</summary>
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
        Think(Pilot(game, player), game, player, BotMode.Attacking);

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
        Think(Pilot(game, player), game, player, BotMode.Attacking);

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

        Think(Pilot(game, player), game, player, BotMode.Building);

        player.HeroState.Cooldowns[TestGames.Slot(player, "healingWave")].Should().BeGreaterThan(0);
        allies.Should().OnlyContain(a => a.Hp > 10);
    }

    [Fact]
    public void Heal_EveryoneAroundTheShamanHealthy_KeepsHealingWaveReady()
    {
        var game = TestGames.CreateWithHeroes("paladin", "shaman");
        var player = game.Players[1];
        AlliesAroundLevelTwoHero(game, player);

        Think(Pilot(game, player), game, player, BotMode.Building);

        player.HeroState.Cooldowns[TestGames.Slot(player, "healingWave")].Should().Be(0);
    }

    [Theory]
    [InlineData(BotDifficulty.Brutal, true)]
    [InlineData(BotDifficulty.Hard, false)]
    public void Explore_HeroIdleShortOfItsPoint_OnlyARoamingHeroGivesThePointUp(BotDifficulty difficulty, bool givesUp)
    {
        var game = TestGames.Create(seed: 3);
        var player = game.Players[0];
        var pilot = Pilot(game, player, difficulty);
        var hero = player.Hero;

        Think(pilot, game, player, BotMode.Building);
        var first = hero.Order.Point;
        // To the pilot a stop between thinks looks like trees hiding the point or barring the way: the hero idles short of it.
        game.Issue(player, new StopCommand { Units = [hero.Id] });
        Think(pilot, game, player, BotMode.Building);

        hero.Order.Type.Should().Be(OrderType.AttackMove);
        (hero.Order.Point != first).Should().Be(givesUp, "a roaming hero gives up a point it stopped short of, other heroes walk to it again");
    }

    [Fact]
    public void Explore_RoamingHeroChargesMidWalk_KeepsItsPoint()
    {
        var game = TestGames.Create(seed: 3);
        var player = game.Players[0];
        var pilot = Pilot(game, player, BotDifficulty.Brutal);
        var hero = player.Hero;

        Think(pilot, game, player, BotMode.Building);
        var first = hero.Order.Point;
        // A charge idles the hero the moment it is cast, the same think or the next.
        OrderSystem.SetIdle(hero);
        hero.Dash = new DashState { Target = hero.Position + new Vector2(3, 0) };
        Think(pilot, game, player, BotMode.Building);

        hero.Order.Type.Should().Be(OrderType.AttackMove);
        hero.Order.Point.Should().Be(first, "a charge cuts the walk short, which says nothing about the point");
    }

    [Theory]
    [InlineData(BotDifficulty.Brutal, OrderType.AttackMove)]
    [InlineData(BotDifficulty.Hard, OrderType.Idle)]
    public void HuntCamp_IdleHeroPastCreepingLevel_OnlyARoamingHeroMovesOn(BotDifficulty difficulty, OrderType order)
    {
        var game = TestGames.Create(seed: 3);
        var player = game.Players[0];
        game.Heroes.AddXp(player, game.Content.Rules.HeroXpForLevel(7) - player.HeroState.Xp);

        Think(Pilot(game, player, difficulty), game, player, BotMode.Building);

        player.Hero.Order.Type.Should().Be(order, "creeps no longer pay, so only a roaming hero goes on exploring");
    }

    [Theory]
    [InlineData(BotDifficulty.Brutal, true)]
    [InlineData(BotDifficulty.Hard, false)]
    public void Explore_EveryPointGivenUp_OnlyARoamingHeroWalksToTheRally(BotDifficulty difficulty, bool walks)
    {
        var game = TestGames.Create(seed: 3);
        var player = game.Players[0];
        var pilot = Pilot(game, player, difficulty);
        var hero = player.Hero;
        hero.Position = game.Walkable(BotBuilder.Toward(game.TownCenter(player).Position, game.MapCenter, -4));

        // Each stop strands the hero short of its point, as trees do, until a roaming hero has given up all 24 ring points.
        for (var i = 0; i < 24; i++)
        {
            Think(pilot, game, player, BotMode.Building);
            game.Issue(player, new StopCommand { Units = [hero.Id] });
        }
        Think(pilot, game, player, BotMode.Building);

        (hero.Order.Type == OrderType.AttackMove && hero.Order.Point == Rally(game, player)).Should().Be(walks,
            "with nothing left to find a roaming hero waits with the army, other heroes keep walking to the same point");
    }

    private static BotHeroPilot Pilot(Game game, Player player, BotDifficulty difficulty = BotDifficulty.Hard)
    {
        var profile = BotProfile.For(difficulty);
        var memory = new BotMemory(game, player, profile, new BotCombatModel(game.Content));
        return new BotHeroPilot(game, player, profile, memory);
    }

    private static void Think(BotHeroPilot pilot, Game game, Player player, BotMode mode)
    {
        pilot.Run(BotView.Capture(game, player, new HashSet<int>()), mode, wantsShop: false, Rally(game, player));
    }

    /// <summary>A stand-in for the army's rally, a few tiles from home toward the map center.</summary>
    private static Vector2 Rally(Game game, Player player)
    {
        return BotBuilder.Toward(game.TownCenter(player).Position, game.MapCenter, 8);
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
