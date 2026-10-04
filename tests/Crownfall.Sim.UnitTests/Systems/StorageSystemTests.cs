using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
using Crownfall.Sim.Systems;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Systems;

public class StorageSystemTests
{
    [Fact]
    public void Caps_AddTheTownCenterAndEveryCompletedStorehouse()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var townCenter = game.TownCenter(player).Stats.Storage;
        var storehouse = game.Content.Building("storehouse");

        player.Stock.Cap(ResourceType.Wood).Should().Be(townCenter);
        var built = game.Place("storehouse", player, game.QuietSpot());
        game.Place("storehouse", player, game.QuietSpot(), complete: false);
        player.Stock.Cap(ResourceType.Gold).Should().Be(townCenter + storehouse.Storage);

        built.Level = 2;
        game.Step([]);
        player.Stock.Cap(ResourceType.Food).Should().Be(townCenter + storehouse.StatsAt(2).Storage);
    }

    [Fact]
    public void Deposit_PastTheCap_KeepsWhatFitsAndWarnsOnce()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var cap = player.Stock.Cap(ResourceType.Wood);
        player.Stock.Add(ResourceType.Wood, cap - 4 - player.Stock[ResourceType.Wood]);

        game.Storage.Store(player, ResourceType.Wood, 10);
        game.Storage.Store(player, ResourceType.Wood, 10);

        player.Stock[ResourceType.Wood].Should().Be(cap);
        game.Events.OfType<NoticeEvent>().Should().ContainSingle(n => n.Text == StorageSystem.FullNotice);
    }

    [Fact]
    public void Villager_DepositAtFullStorage_LosesTheCargo()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var townCenter = game.TownCenter(player);
        player.Stock.Add(ResourceType.Food, player.Stock.Room(ResourceType.Food));
        var villager = game.UnitsOf(player, "villager")[0];
        villager.Position = game.Walkable(townCenter.Position + new Vector2(townCenter.Radius + 1, 0));
        villager.CarryType = ResourceType.Food;
        villager.CarryAmount = 10;
        villager.Order = UnitOrder.ReturnCargo(UnitOrder.Idle);

        TestGames.Run(game, TestGames.Seconds(3));

        villager.IsCarrying.Should().BeFalse();
        player.Stock[ResourceType.Food].Should().Be(player.Stock.Cap(ResourceType.Food));
    }

    [Fact]
    public void Tribute_SendsOnlyWhatTheRecipientCanStore()
    {
        var game = TestGames.Create(perTeam: 2, sharing: ResourceSharing.SeparateWithTribute);
        var (sender, receiver) = (game.Players[0], game.Players[1]);
        sender.Stock.Add(ResourceType.Gold, 300);
        receiver.Stock.Add(ResourceType.Gold, receiver.Stock.Room(ResourceType.Gold) - 45);
        var senderGold = sender.Stock[ResourceType.Gold];

        game.Issue(sender, new TributeCommand { To = receiver.Index, Resource = ResourceType.Gold, Amount = 300 });

        receiver.Stock[ResourceType.Gold].Should().Be(receiver.Stock.Cap(ResourceType.Gold));
        var sent = senderGold - sender.Stock[ResourceType.Gold];
        sent.Should().BeInRange(50, 51);
    }

    [Fact]
    public void Refund_IgnoresTheCap()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        var townCenter = game.TownCenter(player);
        game.Issue(player, new TrainCommand { Building = townCenter.Id, Unit = "villager" });
        player.Stock.Add(ResourceType.Food, player.Stock.Room(ResourceType.Food));
        var full = player.Stock[ResourceType.Food];

        game.Issue(player, new CancelTrainCommand { Building = townCenter.Id });

        player.Stock[ResourceType.Food].Should().Be(full + game.Content.Unit("villager").CostAmounts[(int)ResourceType.Food]);
    }

    [Fact]
    public void SharedStockpile_PoolsEveryTeammatesStorage()
    {
        var game = TestGames.Create(perTeam: 2, sharing: ResourceSharing.Shared);
        var (first, second) = (game.Players[0], game.Players[1]);
        var bothCenters = game.TownCenter(first).Stats.Storage + game.TownCenter(second).Stats.Storage;

        first.Stock.Should().BeSameAs(second.Stock);
        first.Stock.Cap(ResourceType.Stone).Should().Be(bothCenters);
    }
}
