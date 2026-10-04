using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
using Crownfall.Sim.UnitTests.Support;

namespace Crownfall.Sim.UnitTests.Systems;

public class UpgradeSystemTests
{
    [Fact]
    public void Upgrade_AfterItsTime_RaisesTheLevelAndStats()
    {
        var (game, player) = Funded();
        var townCenter = game.TownCenter(player);
        var next = townCenter.NextStats;
        var popCap = player.PopulationCap;

        game.Issue(player, new UpgradeCommand { Building = townCenter.Id });
        var events = RunCollecting(game, TestGames.Seconds(next.UpgradeSeconds) + 2);

        townCenter.Level.Should().Be(2);
        townCenter.IsUpgrading.Should().BeFalse();
        townCenter.MaxHp.Should().BeApproximately(next.Hp * player.Race.BuildingHpMultiplier, 0.01f);
        townCenter.Armor.Should().BeSameAs(next.Armor);
        townCenter.Sight.Should().Be(next.Sight);
        player.PopulationCap.Should().Be(popCap - townCenter.Def.Pop + next.Pop);
        events.OfType<UpgradedEvent>().Should().ContainSingle(e => e.Id == townCenter.Id && e.Level == 2);
    }

    [Fact]
    public void Upgrade_KeepsTheHealthShare()
    {
        var (game, player) = Funded();
        var tower = game.Place("tower", player, game.QuietSpot());
        tower.Hp = tower.MaxHp / 2;

        game.Issue(player, new UpgradeCommand { Building = tower.Id });
        TestGames.Run(game, TestGames.Seconds(tower.NextStats.UpgradeSeconds) + 2);

        tower.Level.Should().Be(2);
        (tower.Hp / tower.MaxHp).Should().BeApproximately(0.5f, 0.001f);
        tower.Stats.Attack.Damage.Should().BeGreaterThan(tower.Def.Attack.Damage);
    }

    [Fact]
    public void Upgrade_ChargesItsPrice_AndCancelRefundsAllOfIt()
    {
        var (game, player) = Funded();
        var house = game.Place("house", player, game.QuietSpot());
        var before = player.Stock.Snapshot();
        var cost = house.NextStats.UpgradeCost;

        game.Issue(player, new UpgradeCommand { Building = house.Id });
        player.Stock.Snapshot().Should().Equal(before.Select((amount, i) => amount - cost[i]));
        TestGames.Run(game, 5);
        game.Issue(player, new CancelUpgradeCommand { Building = house.Id });

        player.Stock.Snapshot().Should().Equal(before);
        house.IsUpgrading.Should().BeFalse();
        house.Level.Should().Be(1);
    }

    [Fact]
    public void Upgrade_LevelThreeBarracks_NeedsALevelTwoTownCenter()
    {
        var (game, player) = Funded();
        var barracks = game.Place("barracks", player, game.QuietSpot());
        barracks.Level = 2;
        barracks.NextStats.TownCenterLevel.Should().Be(2);

        game.Issue(player, new UpgradeCommand { Building = barracks.Id });
        barracks.IsUpgrading.Should().BeFalse();

        game.TownCenter(player).Level = 2;
        game.Issue(player, new UpgradeCommand { Building = barracks.Id });
        barracks.IsUpgrading.Should().BeTrue();
    }

    [Fact]
    public void Upgrade_PausesTraining()
    {
        var (game, player) = Funded();
        var townCenter = game.TownCenter(player);
        game.Issue(player, new TrainCommand { Building = townCenter.Id, Unit = "villager" });
        TestGames.Run(game, 5);
        var progress = townCenter.Queue[0].Progress;

        game.Issue(player, new UpgradeCommand { Building = townCenter.Id });
        TestGames.Run(game, TestGames.Seconds(5));

        townCenter.Queue[0].Progress.Should().Be(progress);
    }

    [Fact]
    public void Upgrade_Refused_AtTheTopLevel_UnderConstruction_OrForAnotherPlayer()
    {
        var (game, player) = Funded();
        var farm = game.Place("farm", player, game.QuietSpot());
        farm.Level = farm.Def.MaxLevel;
        var foundation = game.Place("house", player, game.QuietSpot(), complete: false);
        var enemyCenter = game.TownCenter(game.Players[1]);
        var before = player.Stock.Snapshot();

        game.Issue(player, new UpgradeCommand { Building = farm.Id });
        game.Issue(player, new UpgradeCommand { Building = foundation.Id });
        game.Issue(player, new UpgradeCommand { Building = enemyCenter.Id });

        (farm.IsUpgrading || foundation.IsUpgrading || enemyCenter.IsUpgrading).Should().BeFalse();
        player.Stock.Snapshot().Should().Equal(before);
    }

    [Fact]
    public void UpgradedBarracks_TrainsFaster()
    {
        var (game, player) = Funded();
        var barracks = game.Place("barracks", player, game.QuietSpot());
        var spearman = game.Content.Unit("spearman");
        var baseSeconds = game.Production.TrainSeconds(barracks, spearman);

        barracks.Level = 2;

        game.Production.TrainSeconds(barracks, spearman).Should().BeApproximately(baseSeconds / barracks.Stats.TrainSpeed, 0.001f);
        barracks.Stats.TrainSpeed.Should().BeGreaterThan(1);
    }

    [Fact]
    public void UpgradedBarracks_TrainsStrongerTroops()
    {
        var (game, player) = Funded();
        var barracks = game.Place("barracks", player, game.QuietSpot());
        var spearman = game.Content.Unit("spearman");

        var regular = TrainOne(game, player, barracks, spearman);
        barracks.Level = 3;
        var elite = TrainOne(game, player, barracks, spearman);

        regular.Rank.Should().Be(1);
        regular.AttackDamage.Should().Be(spearman.Attack);
        elite.Rank.Should().Be(3);
        elite.MaxHp.Should().BeApproximately(regular.MaxHp * barracks.Stats.TroopHp, 0.01f);
        elite.Hp.Should().Be(elite.MaxHp);
        elite.AttackDamage.Should().BeApproximately(spearman.Attack * barracks.Stats.TroopAttack, 0.001f);
        barracks.Stats.TroopHp.Should().BeGreaterThan(1);
        barracks.Stats.TroopAttack.Should().BeGreaterThan(1);
    }

    [Fact]
    public void EveryBuilding_UpgradesToLevelThree()
    {
        var game = TestGames.Create();

        game.Content.Buildings.Should().OnlyContain(b => b.MaxLevel == 3);
        game.Content.Building("farm").StatsAt(3).FoodRate.Should().BeGreaterThan(game.Content.Building("farm").StatsAt(2).FoodRate);
        game.Content.Building("house").StatsAt(3).Pop.Should().BeGreaterThan(game.Content.Building("house").StatsAt(2).Pop);
    }

    [Theory]
    [InlineData("house")]
    [InlineData("storehouse")]
    [InlineData("farm")]
    public void Upgrade_ToLevelThree_NeedsALevelTwoTownCenter(string buildingId)
    {
        var (game, player) = Funded();
        var building = game.Place(buildingId, player, game.QuietSpot());
        building.Level = 2;

        game.Upgrades.Refusal(player, building).Should().Be("Requires a level 2 town center.");
        game.TownCenter(player).Level = 2;
        game.Upgrades.Refusal(player, building).Should().BeNull();
    }

    private static Unit TrainOne(Game game, Player player, Building barracks, UnitDef def)
    {
        var before = game.UnitsOf(player, def.Id).Select(u => u.Id).ToHashSet();
        game.Issue(player, new TrainCommand { Building = barracks.Id, Unit = def.Id });
        TestGames.Run(game, (int)MathF.Ceiling(game.Production.TrainSeconds(barracks, def) / game.Dt) + 2);
        return game.UnitsOf(player, def.Id).Single(u => !before.Contains(u.Id));
    }

    private static (Game Game, Player Player) Funded()
    {
        var game = TestGames.Create();
        var player = game.Players[0];
        player.Stock.Add([2000, 2000, 2000, 2000]);
        return (game, player);
    }

    private static List<GameEvent> RunCollecting(Game game, int ticks)
    {
        var events = new List<GameEvent>();
        for (var i = 0; i < ticks; i++)
        {
            game.Step([]);
            events.AddRange(game.Events);
        }
        return events;
    }
}
