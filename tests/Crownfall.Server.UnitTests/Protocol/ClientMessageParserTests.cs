using Crownfall.Server.Protocol;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;

namespace Crownfall.Server.UnitTests.Protocol;

public class ClientMessageParserTests
{
    [Fact]
    public void Parse_MoveCommand_ReadsUnitsAndTarget()
    {
        var message = ClientMessageParser.Parse("""{"t":"cmd","c":{"type":"move","units":[3,4],"x":10.5,"y":20,"attackMove":true}}""");

        var move = message.Should().BeOfType<CommandRequest>().Which.Command.Should().BeOfType<MoveCommand>().Subject;
        move.Units.Should().Equal(3, 4);
        move.X.Should().Be(10.5f);
        move.AttackMove.Should().BeTrue();
    }

    [Fact]
    public void Parse_Tribute_ReadsCamelCaseResource()
    {
        var message = ClientMessageParser.Parse("""{"t":"cmd","c":{"type":"tribute","to":1,"resource":"gold","amount":100}}""");

        message.Should().BeOfType<CommandRequest>().Which.Command.Should().BeOfType<TributeCommand>()
            .Which.Resource.Should().Be(ResourceType.Gold);
    }

    [Fact]
    public void Parse_HeroStat_ReadsTheStatId()
    {
        var message = ClientMessageParser.Parse("""{"t":"cmd","c":{"type":"heroStat","stat":"lifeSteal"}}""");

        message.Should().BeOfType<CommandRequest>().Which.Command.Should().BeOfType<HeroStatCommand>()
            .Which.Stat.Should().Be("lifeSteal");
    }

    [Fact]
    public void Parse_ReviveHero_DefaultsToAnyTownCenter()
    {
        var message = ClientMessageParser.Parse("""{"t":"cmd","c":{"type":"reviveHero"}}""");

        message.Should().BeOfType<CommandRequest>().Which.Command.Should().BeOfType<ReviveHeroCommand>()
            .Which.Building.Should().Be(0);
    }

    [Fact]
    public void Parse_UpgradeAndCancel_ReadTheBuilding()
    {
        var upgrade = ClientMessageParser.Parse("""{"t":"cmd","c":{"type":"upgrade","building":12}}""");
        var cancel = ClientMessageParser.Parse("""{"t":"cmd","c":{"type":"cancelUpgrade","building":12}}""");

        upgrade.Should().BeOfType<CommandRequest>().Which.Command.Should().BeOfType<UpgradeCommand>().Which.Building.Should().Be(12);
        cancel.Should().BeOfType<CommandRequest>().Which.Command.Should().BeOfType<CancelUpgradeCommand>().Which.Building.Should().Be(12);
    }

    [Fact]
    public void Parse_BuildLine_ReadsBuildersBuildingAndBothEnds()
    {
        var message = ClientMessageParser.Parse("""{"t":"cmd","c":{"type":"buildLine","units":[3,4],"building":"wall","x1":10,"y1":11,"x2":18,"y2":15}}""");

        var line = message.Should().BeOfType<CommandRequest>().Which.Command.Should().BeOfType<BuildLineCommand>().Subject;
        line.Units.Should().Equal(3, 4);
        (line.Building, line.X1, line.Y1, line.X2, line.Y2).Should().Be(("wall", 10, 11, 18, 15));
    }

    [Fact]
    public void Parse_Trade_ReadsResourceAndSide()
    {
        var message = ClientMessageParser.Parse("""{"t":"cmd","c":{"type":"trade","building":7,"resource":"stone","buy":true}}""");

        var trade = message.Should().BeOfType<CommandRequest>().Which.Command.Should().BeOfType<TradeCommand>().Subject;
        (trade.Building, trade.Resource, trade.Buy).Should().Be((7, ResourceType.Stone, true));
    }

    [Fact]
    public void Parse_BuyAndSellItem_ReadTheItemAndTheSlot()
    {
        var buy = ClientMessageParser.Parse("""{"t":"cmd","c":{"type":"buyItem","item":"ironSword"}}""");
        var sell = ClientMessageParser.Parse("""{"t":"cmd","c":{"type":"sellItem","slot":4}}""");

        buy.Should().BeOfType<CommandRequest>().Which.Command.Should().BeOfType<BuyItemCommand>().Which.Item.Should().Be("ironSword");
        sell.Should().BeOfType<CommandRequest>().Which.Command.Should().BeOfType<SellItemCommand>().Which.Slot.Should().Be(4);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("""{"t":"cmd"}""")]
    [InlineData("""{"t":"cmd","c":{"type":"selfDestruct"}}""")]
    [InlineData("""{"t":"cmd","c":{"type":"move","units":"all"}}""")]
    [InlineData("""{"t":"ping","c":"soon"}""")]
    [InlineData("""{"t":"lobby","action":"team","team":"blue"}""")]
    [InlineData("""{"t":"lobby","action":"name","name":{"first":"Daniel"}}""")]
    [InlineData("""{"t":"lobby","action":"name","name":["Daniel"]}""")]
    [InlineData("[]")]
    public void Parse_Malformed_ReturnsNull(string text)
    {
        ClientMessageParser.Parse(text).Should().BeNull();
    }

    [Fact]
    public void Parse_LobbyTeamSwitch_ReadsTeam()
    {
        ClientMessageParser.Parse("""{"t":"lobby","action":"team","team":2}""")
            .Should().Be(new LobbyRequest(LobbyAction.SwitchTeam, 2, null));
    }

    [Fact]
    public void Parse_LobbyRename_ReadsName()
    {
        ClientMessageParser.Parse("""{"t":"lobby","action":"name","name":"Daniel"}""")
            .Should().Be(new LobbyRequest(LobbyAction.SetName, 0, null, "Daniel"));
    }
}
