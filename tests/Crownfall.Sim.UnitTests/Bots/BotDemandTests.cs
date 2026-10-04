using Crownfall.Sim.Bots;
using Crownfall.Sim.Core;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Bots;

public class BotDemandTests
{
    private static readonly bool[] Everywhere = [true, true, true, true];

    [Fact]
    public void ReviveWorkers_BigShortfall_TakesAtMostAQuarterOfTheWorkforce()
    {
        var targets = BotDemand.ReviveWorkers([3.2f, 0, 0, 5.5f], 20);

        targets.Sum().Should().Be(5);
        targets.Should().OnlyContain(t => t >= 0);
        targets[(int)ResourceType.Gold].Should().BeGreaterThanOrEqualTo(targets[(int)ResourceType.Food]);
    }

    [Fact]
    public void ReviveWorkers_SmallShortfall_StillPutsOneVillagerOnEachMissingResource()
    {
        BotDemand.ReviveWorkers([0.1f, 0, 0, 0.1f], 20).Should().Equal(1, 0, 0, 1);
    }

    [Fact]
    public void Targets_ReviveSoonerDue_GetsMoreVillagers_ButNoneFasterThanTheMinimumPace()
    {
        var game = TestGames.Create(seed: 3);
        var player = game.Players[0];
        player.Stock.TrySpend(player.Stock.Snapshot());
        var demand = new BotDemand(game, player, BotProfile.For(BotDifficulty.Normal), new BotCombatModel(game.Content));
        var view = BotView.Capture(game, player, new HashSet<int>());
        var mix = new float[game.Content.Units.Count];
        var none = new int[Resources.Count];
        var reserve = new int[Resources.Count];
        reserve[(int)ResourceType.Food] = 400;
        reserve[(int)ResourceType.Gold] = 400;

        var soon = demand.Targets(view, 20, mix, none, reserve, 20, Everywhere, false);
        var now = demand.Targets(view, 20, mix, none, reserve, 0, Everywhere, false);
        var late = demand.Targets(view, 20, mix, none, reserve, 600, Everywhere, false);

        int OnRevive(int[] targets) => targets[(int)ResourceType.Food] + targets[(int)ResourceType.Gold];
        OnRevive(soon).Should().BeGreaterThan(OnRevive(late));
        now.Should().Equal(soon, "a revive due at once is paced like one due at the minimum");
        soon.Sum().Should().Be(20);
    }
}
