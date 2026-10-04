using System.Numerics;
using Crownfall.Sim.Core;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Bots;

/// <summary>The tutorial's sparring partner against an idle seat: it must grow at home and never come out.</summary>
public class BotPassiveTests
{
    private const float HomeRadius = 16f;

    [Fact]
    public void Passive_TenMinutesAgainstAnIdleSeat_BuildsAnEconomyAndNeverLeavesHome()
    {
        var game = TestGames.Create(seed: 4);
        var bot = game.Players[1];
        var idle = game.Players[0];
        TestGames.EnableBot(game, bot, BotDifficulty.Passive);
        var home = game.TownCenter(bot).Position;
        // The dragon lands mid-match on its own timer, so only the ordinary camps are counted.
        var wolves = game.Entities.Units.Count(u => u.Camp is { IsLair: false });
        var farthest = 0f;

        for (var i = 0; i < TestGames.Seconds(10 * 60); i++)
        {
            game.Step([]);
            if (bot.Hero != null)
            {
                farthest = MathF.Max(farthest, Vector2.Distance(bot.Hero.Position, home));
            }
        }

        bot.Stats.UnitsTrained.Should().BeGreaterThanOrEqualTo(4, "the passive bot should still train villagers");
        bot.Stats.BuildingsBuilt.Should().BeGreaterThanOrEqualTo(1, "the passive bot should still build");
        game.Entities.Units.Should().NotContain(u => u.Owner == bot && u.Def.IsMilitary, "a passive bot trains no soldiers");
        farthest.Should().BeLessThan(HomeRadius, "the passive hero should never go out scouting or creeping");
        game.Entities.Units.Count(u => u.Camp is { IsLair: false }).Should().Be(wolves, "the passive bot leaves every creep camp for the player");
        idle.Stats.Losses.Should().Be(0);
        game.IsOver.Should().BeFalse();
    }
}
