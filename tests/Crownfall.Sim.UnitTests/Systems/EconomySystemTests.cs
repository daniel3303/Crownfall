using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Systems;

public class EconomySystemTests
{
    [Fact]
    public void Gather_Berries_DepositsFoodAtTownCenter()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var villager = game.UnitsOf(player, "villager")[0];
        var berries = game.Entities.Nodes
            .Where(n => n.Def.ResourceType == ResourceType.Food)
            .OrderBy(n => n.Rect.DistanceTo(game.TownCenter(player).Position))
            .First();
        var foodBefore = player.Stock[ResourceType.Food];

        game.Issue(player, new GatherCommand { Units = [villager.Id], Target = berries.Id });
        TestGames.Run(game, TestGames.Seconds(40));

        player.Stock[ResourceType.Food].Should().BeGreaterThanOrEqualTo(foodBefore + 20);
        player.Stats.Gathered.Should().BeGreaterThanOrEqualTo(20);
    }

    [Fact]
    public void Gather_LastGoldInAMine_RemovesItForGood()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var villager = game.UnitsOf(player, "villager")[0];
        var mine = game.Entities.Nodes
            .Where(n => n.Def.Id == "goldMine")
            .OrderBy(n => n.Rect.DistanceTo(game.TownCenter(player).Position))
            .First();
        var mines = game.Entities.Nodes.Count(n => n.Def.Id == "goldMine");
        mine.Amount = 1;

        game.Issue(player, new GatherCommand { Units = [villager.Id], Target = mine.Id });
        TestGames.Run(game, TestGames.Seconds(60));

        mine.IsRemoved.Should().BeTrue();
        game.Entities.Nodes.Count(n => n.Def.Id == "goldMine").Should().Be(mines - 1);
        game.Content.Node("goldMine").Amount.Should().Be(2000);
    }

    [Fact]
    public void Build_House_SpendsWoodAndRaisesPopulationCap()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var villager = game.UnitsOf(player, "villager")[0];
        var house = game.Content.Building("house");
        Crownfall.Sim.Bots.BuildSpotFinder.TryFind(game, player, house, game.TownCenter(player).Position, 4, 10, out var spot).Should().BeTrue();
        var woodBefore = player.Stock[ResourceType.Wood];
        var capBefore = player.PopulationCap;

        game.Issue(player, new BuildCommand { Units = [villager.Id], Building = "house", X = spot.X, Y = spot.Y });
        player.Stock[ResourceType.Wood].Should().Be(woodBefore - 30);
        TestGames.Run(game, TestGames.Seconds(30));

        game.Entities.Buildings.Should().Contain(b => b.Def.Id == "house" && b.IsComplete && b.Owner == player);
        player.PopulationCap.Should().Be(capBefore + 5);
    }

    [Fact]
    public void Build_OnOccupiedTiles_IsRejectedWithoutSpending()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var townCenter = game.TownCenter(player);
        var villager = game.UnitsOf(player, "villager")[0];
        var woodBefore = player.Stock[ResourceType.Wood];

        game.Issue(player, new BuildCommand { Units = [villager.Id], Building = "house", X = townCenter.Rect.X, Y = townCenter.Rect.Y });

        player.Stock[ResourceType.Wood].Should().Be(woodBefore);
        game.Entities.Buildings.Should().NotContain(b => b.Def.Id == "house");
    }

    [Fact]
    public void Train_Villager_SpawnsAfterTrainTime()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var before = game.UnitsOf(player, "villager").Count;

        game.Issue(player, new TrainCommand { Building = game.TownCenter(player).Id, Unit = "villager" });
        TestGames.Run(game, TestGames.Seconds(10.5f));

        game.UnitsOf(player, "villager").Should().HaveCount(before + 1);
        player.Stats.UnitsTrained.Should().Be(1);
    }

    [Fact]
    public void Train_AtPopulationCap_WaitsForHousing()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var townCenter = game.TownCenter(player);
        while (player.Population < player.PopulationCap)
        {
            game.Spawn("villager", player, townCenter.Position + new System.Numerics.Vector2(4, 4));
            game.Step([]);
        }
        var before = game.UnitsOf(player, "villager").Count;

        game.Issue(player, new TrainCommand { Building = townCenter.Id, Unit = "villager" });
        TestGames.Run(game, TestGames.Seconds(20));

        game.UnitsOf(player, "villager").Should().HaveCount(before);
        townCenter.Queue.Should().ContainSingle().Which.Progress.Should().Be(0);
    }

    [Fact]
    public void CancelTrain_RefundsTheQueuedCost()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var townCenter = game.TownCenter(player);
        var food = player.Stock[ResourceType.Food];

        game.Issue(player, new TrainCommand { Building = townCenter.Id, Unit = "villager" });
        game.Issue(player, new CancelTrainCommand { Building = townCenter.Id });

        player.Stock[ResourceType.Food].Should().Be(food);
        townCenter.Queue.Should().BeEmpty();
    }
}
