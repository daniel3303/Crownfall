using Crownfall.Server.Protocol;
using Crownfall.Server.Protocol.Messages;
using Crownfall.Sim.Core;
using Crownfall.Sim.Events;
using Newtonsoft.Json.Linq;

namespace Crownfall.Server.UnitTests.Protocol;

public class WireJsonTests
{
    [Fact]
    public void Serialize_DeathEvent_WritesTheKeysTheClientReads()
    {
        var message = new EventsMessage
        {
            Tick = 7,
            Events = [new DeathEvent { Id = 5, Owner = 1, EntityKind = 3, X = 2.5f, Y = 4, Category = "unit" }],
        };

        var death = JObject.Parse(WireJson.Serialize(message))["events"]![0]!;

        // client/src/net/protocol.ts: { k: "death"; id; owner; entityKind; x; y; category }
        death["k"]!.Value<string>().Should().Be("death");
        death["id"]!.Value<int>().Should().Be(5);
        death["owner"]!.Value<int>().Should().Be(1);
        death["entityKind"]!.Value<int>().Should().Be(3);
        death["x"]!.Value<float>().Should().Be(2.5f);
        death["category"]!.Value<string>().Should().Be("unit");
    }

    [Fact]
    public void Serialize_AnnouncementEvent_WritesTheKeysTheClientReads()
    {
        var message = new EventsMessage
        {
            Tick = 7,
            Events = [new AnnouncementEvent { Type = AnnouncementType.FirstBlood, Title = "First Blood", Text = "Ana drew first blood.", Player = 1, X = 3, Y = 4 }],
        };

        var announce = JObject.Parse(WireJson.Serialize(message))["events"]![0]!;

        // client/src/net/protocol.ts: { k: "announce"; type; title; text; player; team; x; y }
        announce["k"]!.Value<string>().Should().Be("announce");
        announce["type"]!.Value<string>().Should().Be("firstBlood");
        announce["title"]!.Value<string>().Should().Be("First Blood");
        announce["player"]!.Value<int>().Should().Be(1);
        announce["team"]!.Value<int>().Should().Be(-1);
    }

    [Fact]
    public void Serialize_HeroWithAnEmptySlot_KeepsTheSlotAsNull()
    {
        var hero = new HeroView { Items = ["ironSword", null], CanShop = true, Streak = 3, CooldownFactor = 0.8f };

        var json = JObject.Parse(WireJson.Serialize(hero));

        json["items"]!.Select(i => i.Type == JTokenType.Null ? null : i.Value<string>()).Should().Equal("ironSword", null);
        json["canShop"]!.Value<bool>().Should().BeTrue();
        json["streak"]!.Value<int>().Should().Be(3);
        json["cooldownFactor"]!.Value<float>().Should().Be(0.8f);
    }
}
