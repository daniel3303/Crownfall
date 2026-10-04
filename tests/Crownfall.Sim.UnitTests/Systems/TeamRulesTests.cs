using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Systems;

public class TeamRulesTests
{
    [Fact]
    public void SharedResources_TeammatesSpendFromOnePool()
    {
        var game = TestGames.Create(perTeam: 2, sharing: ResourceSharing.Shared);
        var (first, second) = (game.Players[0], game.Players[1]);

        first.Stock.Should().BeSameAs(second.Stock);
        first.Stock[ResourceType.Food].Should().Be(game.Content.StartingResources[(int)ResourceType.Food] * 2);
        game.Players[2].Stock.Should().NotBeSameAs(first.Stock);
    }

    [Fact]
    public void Tribute_SendsResourcesMinusTax()
    {
        var game = TestGames.Create(perTeam: 2, sharing: ResourceSharing.SeparateWithTribute);
        var (sender, receiver) = (game.Players[0], game.Players[1]);
        var receiverGold = receiver.Stock[ResourceType.Gold];

        game.Issue(sender, new TributeCommand { To = receiver.Index, Resource = ResourceType.Gold, Amount = 100 });

        sender.Stock[ResourceType.Gold].Should().Be(0);
        receiver.Stock[ResourceType.Gold].Should().Be(receiverGold + 90);
    }

    [Fact]
    public void Tribute_InSeparateMode_IsRefused()
    {
        var game = TestGames.Create(perTeam: 2, sharing: ResourceSharing.Separate);
        var (sender, receiver) = (game.Players[0], game.Players[1]);

        game.Issue(sender, new TributeCommand { To = receiver.Index, Resource = ResourceType.Gold, Amount = 100 });

        sender.Stock[ResourceType.Gold].Should().Be(100);
    }

    [Fact]
    public void Tribute_ToAnEnemy_IsRefused()
    {
        var game = TestGames.Create(perTeam: 2);
        var sender = game.Players[0];
        var enemy = game.Players.First(p => p.Team != sender.Team);

        game.Issue(sender, new TributeCommand { To = enemy.Index, Resource = ResourceType.Gold, Amount = 50 });

        sender.Stock[ResourceType.Gold].Should().Be(100);
    }

    [Fact]
    public void Move_AnotherPlayersUnit_IsIgnored()
    {
        var game = TestGames.Create();
        var enemyVillager = game.UnitsOf(game.Players[1], "villager")[0];
        var start = enemyVillager.Position;

        game.Issue(game.Players[0], new MoveCommand { Units = [enemyVillager.Id], X = 5, Y = 5 });
        TestGames.Run(game, 20);

        enemyVillager.Position.Should().Be(start);
    }

    [Fact]
    public void Vision_HidesEnemiesUntilOwnUnitsGetClose()
    {
        var game = TestGames.Create();
        var spot = game.QuietSpot();
        var enemy = game.Spawn("spearman", game.Players[1], spot);
        game.Step([]);
        game.Vision.IsVisible(game.Players[0].Team, enemy).Should().BeFalse();

        game.Spawn("spearman", game.Players[0], spot + new Vector2(3, 0));
        game.Step([]);

        game.Vision.IsVisible(game.Players[0].Team, enemy).Should().BeTrue();
    }

    [Fact]
    public void Victory_LastTeamWithTownCenterOrVillagersWins()
    {
        var game = TestGames.Create();
        var loser = game.Players[1];
        foreach (var entity in game.Entities.All().Where(e => e.Owner == loser && (e.Category == Entities.EntityCategory.Building || e is Entities.Unit { Def.IsVillager: true })).ToList())
        {
            game.Kill(entity, game.Players[0]);
        }

        TestGames.Run(game, TestGames.Seconds(2));

        loser.IsDefeated.Should().BeTrue();
        game.IsOver.Should().BeTrue();
        game.WinningTeam.Should().Be(game.Players[0].Team);
    }
}
