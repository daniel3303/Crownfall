using Crownfall.Sim.Commands;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Crownfall.Server.Protocol;

/// <summary>
/// Parses client text frames: {"t":"cmd","c":{"type":"move",...}}, {"t":"lobby","action":"start"}, {"t":"ping","c":1}.
/// Anything malformed returns null and is dropped; the simulation re-validates every command.
/// </summary>
public static class ClientMessageParser
{
    private static readonly Dictionary<string, Type> CommandTypes = new()
    {
        ["move"] = typeof(MoveCommand),
        ["attack"] = typeof(AttackCommand),
        ["gather"] = typeof(GatherCommand),
        ["build"] = typeof(BuildCommand),
        ["buildLine"] = typeof(BuildLineCommand),
        ["construct"] = typeof(ConstructCommand),
        ["stop"] = typeof(StopCommand),
        ["train"] = typeof(TrainCommand),
        ["cancelTrain"] = typeof(CancelTrainCommand),
        ["rally"] = typeof(RallyCommand),
        ["ability"] = typeof(AbilityCommand),
        ["tribute"] = typeof(TributeCommand),
        ["heroStat"] = typeof(HeroStatCommand),
        ["pickTalent"] = typeof(PickTalentCommand),
        ["reviveHero"] = typeof(ReviveHeroCommand),
        ["buyItem"] = typeof(BuyItemCommand),
        ["sellItem"] = typeof(SellItemCommand),
        ["upgrade"] = typeof(UpgradeCommand),
        ["cancelUpgrade"] = typeof(CancelUpgradeCommand),
        ["trade"] = typeof(TradeCommand),
    };

    public static ClientMessage Parse(string text)
    {
        JObject root;
        try
        {
            root = JObject.Parse(text);
        }
        catch (JsonReaderException)
        {
            return null;
        }
        try
        {
            return root.Value<string>("t") switch
            {
                "cmd" => ParseCommand(root["c"] as JObject),
                "lobby" => ParseLobby(root),
                "ping" => root["c"]?.Type is JTokenType.Float or JTokenType.Integer ? new PingRequest(root.Value<double>("c")) : null,
                _ => null,
            };
        }
        catch (Exception exception) when (exception is JsonException or InvalidCastException or FormatException or OverflowException)
        {
            return null;
        }
    }

    private static ClientMessage ParseCommand(JObject body)
    {
        var type = body?.Value<string>("type");
        if (type == null || !CommandTypes.TryGetValue(type, out var commandType))
        {
            return null;
        }
        var command = (PlayerCommand)body.ToObject(commandType, WireJson.Serializer);
        return command == null ? null : new CommandRequest(command);
    }

    private static ClientMessage ParseLobby(JObject root)
    {
        return root.Value<string>("action") switch
        {
            "start" => new LobbyRequest(LobbyAction.Start, 0, null),
            "team" => new LobbyRequest(LobbyAction.SwitchTeam, root.Value<int>("team"), null),
            "race" => new LobbyRequest(LobbyAction.SetRace, 0, root.Value<string>("race")),
            "name" => new LobbyRequest(LobbyAction.SetName, 0, null, root.Value<string>("name")),
            "hero" => new LobbyRequest(LobbyAction.SetHero, 0, null, null, root.Value<string>("hero")),
            _ => null,
        };
    }
}
