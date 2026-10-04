using Crownfall.Server.Protocol;
using Crownfall.Server.UnitTests.Support;
using Crownfall.Sim;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Newtonsoft.Json.Linq;

namespace Crownfall.Server.UnitTests.Protocol;

public class SnapshotEncoderTests
{
    [Fact]
    public void Encode_GoldenFixture_MatchesCommittedBytes()
    {
        var fixture = JObject.Parse(File.ReadAllText(RepoFiles.Path("protocol", "fixtures", "snapshot-v2.json")));
        var records = fixture["entities"]!.Select(e => new EntityRecord(
            e.Value<uint>("id"),
            e.Value<byte>("kind"),
            e.Value<byte>("owner"),
            e.Value<ushort>("x"),
            e.Value<ushort>("y"),
            e.Value<ushort>("hp"),
            e.Value<ushort>("maxHp"),
            e.Value<byte>("state"),
            e.Value<byte>("facing"),
            e.Value<byte>("extra"),
            e.Value<byte>("flags"),
            e.Value<byte>("attackSpeed"))).ToList();

        var bytes = SnapshotEncoder.Encode(fixture.Value<uint>("tick"), records);

        var binPath = RepoFiles.Path("protocol", "fixtures", "snapshot-v2.bin");
        if (Environment.GetEnvironmentVariable("CROWNFALL_UPDATE_FIXTURES") == "1")
        {
            File.WriteAllBytes(binPath, bytes);
        }
        bytes.Should().Equal(File.ReadAllBytes(binPath));
        bytes.Length.Should().Be(SnapshotEncoder.HeaderSize + records.Count * SnapshotEncoder.RecordSize);
    }

    [Fact]
    public void Describe_HeroWithAttackSpeedRanksUnderRally_SendsItsCombinedAttackSpeed()
    {
        var content = ContentDb.Load(ContentDb.FindDefaultPath());
        var game = new Game(content, new MatchConfig { Seed = 1, Teams = 2, PlayersPerTeam = 1 }, [
            new PlayerSetup { Name = "A", Team = 0, Race = "humans" },
            new PlayerSetup { Name = "B", Team = 1, Race = "orcs" },
        ]);
        var hero = game.Players[0].Hero;
        var villager = game.Entities.Units.First(u => u.Owner == game.Players[0] && u.Def.IsVillager);
        hero.Hero.Ranks[content.HeroStatIndex("attackSpeed")] = 2;
        hero.Buff = content.Abilities.First(a => a.AttackSpeedBonus > 0);
        hero.BuffUntilTick = game.Tick + 100;
        var expected = 1 + 2 * content.HeroStats[content.HeroStatIndex("attackSpeed")].PerRank + hero.Buff.AttackSpeedBonus;

        var record = SnapshotEncoder.Describe(hero, game.Tick);

        (record.AttackSpeed / SnapshotEncoder.AttackSpeedScale).Should().BeApproximately(expected, 1 / SnapshotEncoder.AttackSpeedScale);
        SnapshotEncoder.Describe(villager, game.Tick).AttackSpeed.Should().Be(SnapshotEncoder.BaseAttackSpeed);
    }

    [Fact]
    public void Describe_HeroAttackingFasterThanTheByteHolds_SendsTheMaximum()
    {
        var content = ContentDb.Load(ContentDb.FindDefaultPath());
        var game = new Game(content, new MatchConfig { Seed = 1, Teams = 2, PlayersPerTeam = 1 }, [
            new PlayerSetup { Name = "A", Team = 0, Race = "humans" },
            new PlayerSetup { Name = "B", Team = 1, Race = "orcs" },
        ]);
        var hero = game.Players[0].Hero;
        hero.Hero.Ranks[content.HeroStatIndex("attackSpeed")] = 1000;

        SnapshotEncoder.Describe(hero, game.Tick).AttackSpeed.Should().Be(byte.MaxValue);
    }

    [Fact]
    public void Describe_SoldierFromAnUpgradedBarracks_SendsItsRankUnlessItCarriesALoad()
    {
        var content = ContentDb.Load(ContentDb.FindDefaultPath());
        var game = new Game(content, new MatchConfig { Seed = 1, Teams = 2, PlayersPerTeam = 1 }, [
            new PlayerSetup { Name = "A", Team = 0, Race = "humans" },
            new PlayerSetup { Name = "B", Team = 1, Race = "orcs" },
        ]);
        var owner = game.Players[0];
        var soldier = game.SpawnUnit(content.Unit("spearman"), owner, game.Players[0].Hero.Position);
        var regular = game.SpawnUnit(content.Unit("spearman"), owner, game.Players[0].Hero.Position);
        soldier.Rank = 3;

        SnapshotEncoder.Describe(soldier, game.Tick).Extra.Should().Be(3);
        SnapshotEncoder.Describe(regular, game.Tick).Extra.Should().Be(1);
        soldier.CarryType = ResourceType.Gold;
        soldier.CarryAmount = 7;
        SnapshotEncoder.Describe(soldier, game.Tick).Extra.Should().Be(7);
    }

    [Fact]
    public void Describe_SoldierOfATeamWithTheDragonBuff_IsFlaggedBuffed()
    {
        var content = ContentDb.Load(ContentDb.FindDefaultPath());
        var game = new Game(content, new MatchConfig { Seed = 1, Teams = 2, PlayersPerTeam = 1 }, [
            new PlayerSetup { Name = "A", Team = 0, Race = "humans" },
            new PlayerSetup { Name = "B", Team = 1, Race = "orcs" },
        ]);
        var owner = game.Players[0];
        var soldier = game.SpawnUnit(content.Unit("spearman"), owner, owner.Hero.Position);
        var unbuffed = ((SnapshotFlags)SnapshotEncoder.Describe(soldier, game.Tick).Flags).HasFlag(SnapshotFlags.Buffed);

        owner.AttackBuff = content.Rules.Dragon.BuffAttack;

        unbuffed.Should().BeFalse();
        ((SnapshotFlags)SnapshotEncoder.Describe(soldier, game.Tick).Flags).Should().HaveFlag(SnapshotFlags.Buffed);
    }

    [Fact]
    public void Describe_UpgradingBuilding_SendsItsLevelAndUpgradeProgress()
    {
        var content = ContentDb.Load(ContentDb.FindDefaultPath());
        var game = new Game(content, new MatchConfig { Seed = 1, Teams = 2, PlayersPerTeam = 1 }, [
            new PlayerSetup { Name = "A", Team = 0, Race = "humans" },
            new PlayerSetup { Name = "B", Team = 1, Race = "orcs" },
        ]);
        var townCenter = game.Entities.Buildings.First(b => b.Owner == game.Players[0] && b.Def.IsTownCenter);
        townCenter.Level = 2;
        townCenter.IsUpgrading = true;
        townCenter.UpgradeProgress = 0.42f;

        var record = SnapshotEncoder.Describe(townCenter, game.Tick);

        record.State.Should().Be(2);
        record.Extra.Should().Be(42);
        ((SnapshotFlags)record.Flags).Should().HaveFlag(SnapshotFlags.Upgrading);
    }
}
