using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Systems;

public class RaidSystemTests
{
    [Fact]
    public void Thief_TakesFromTheVictim_AndBringsItHome_WithNothingCreated()
    {
        var (game, thiefOwner, victim, store, thief) = Raid();
        var (gainerBefore, victimBefore) = (Total(thiefOwner), Total(victim));

        game.Issue(thiefOwner, new GatherCommand { Units = [thief.Id], Target = store.Id });
        var warnedAt = new List<int>();
        for (var i = 0; i < TestGames.Seconds(60); i++)
        {
            game.Step([]);
            if (game.Events.OfType<NoticeEvent>().Any(n => n.Player == victim.Index && n.Text.Contains("raided")))
            {
                warnedAt.Add(game.Tick);
            }
        }

        var banked = Total(thiefOwner) - gainerBefore;
        var stolen = victimBefore - Total(victim);
        banked.Should().BePositive();
        (banked + (int)thief.CarryAmount).Should().Be(stolen);
        warnedAt.Should().NotBeEmpty();
        warnedAt.Zip(warnedAt.Skip(1), (a, b) => b - a).Should().OnlyContain(gap => gap >= TestGames.Seconds(game.Content.Rules.RaidNoticeSeconds));
    }

    [Fact]
    public void Thief_NeverTakesMoreThanTheVictimHolds()
    {
        var (game, thiefOwner, victim, store, thief) = Raid();
        foreach (var type in Resources.All)
        {
            victim.Stock.TryTake(type, victim.Stock[type]);
        }
        victim.Stock.Add(ResourceType.Stone, 3);
        var before = Total(thiefOwner);

        game.Issue(thiefOwner, new GatherCommand { Units = [thief.Id], Target = store.Id });
        TestGames.Run(game, TestGames.Seconds(40));

        victim.Stock[ResourceType.Stone].Should().Be(0);
        Resources.All.Should().OnlyContain(type => victim.Stock[type] >= 0);
        (Total(thiefOwner) + (int)thief.CarryAmount - before).Should().Be(3);
    }

    [Fact]
    public void MilitaryUnits_SentToRaid_AttackTheBuilding()
    {
        var (game, thiefOwner, _, store, thief) = Raid();
        var spearman = game.Spawn("spearman", thiefOwner, thief.Position);
        game.Step([]);

        game.Issue(thiefOwner, new GatherCommand { Units = [spearman.Id], Target = store.Id });

        spearman.Order.Type.Should().Be(OrderType.Attack);
        spearman.Order.Target.Should().Be(store);
    }

    [Fact]
    public void Gather_OnAnAlliedStorehouse_IsIgnored()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var store = game.Place("storehouse", player, game.QuietSpot());
        var villager = game.Spawn("villager", player, game.Walkable(store.Position + new Vector2(2, 0)));
        game.Step([]);

        game.Issue(player, new GatherCommand { Units = [villager.Id], Target = store.Id });

        villager.Order.Type.Should().NotBe(OrderType.Gather);
    }

    private static int Total(Player player)
    {
        return Resources.Total(player.Stock.Snapshot());
    }

    /// <summary>An enemy storehouse at a quiet spot with the thief's own storehouse a few tiles away.</summary>
    private static (Game Game, Player ThiefOwner, Player Victim, Building Store, Unit Thief) Raid()
    {
        var game = TestGames.Create();
        var (thiefOwner, victim) = (game.Players[0], game.Players[1]);
        var spot = game.QuietSpot();
        var store = game.Place("storehouse", victim, spot);
        game.Place("storehouse", thiefOwner, spot + new Vector2(5, 0));
        var thief = game.Spawn("villager", thiefOwner, game.Walkable(spot + new Vector2(2.5f, 0)));
        game.Step([]);
        return (game, thiefOwner, victim, store, thief);
    }
}
