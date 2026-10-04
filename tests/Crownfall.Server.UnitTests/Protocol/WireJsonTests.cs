using Crownfall.Server.Protocol;
using Crownfall.Server.Protocol.Messages;
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
}
