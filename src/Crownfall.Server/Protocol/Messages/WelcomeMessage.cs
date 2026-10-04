using Crownfall.Sim.Core;

namespace Crownfall.Server.Protocol.Messages;

/// <summary>Sent when a game starts or a player joins one in progress.</summary>
public sealed class WelcomeMessage : ServerMessage
{
    public override string T => "welcome";
    public string MatchId { get; init; }
    public int You { get; init; }
    public MatchConfig Config { get; init; }
    public int TickRate { get; init; }
    public int Tick { get; init; }
    public List<PlayerView> Players { get; init; } = [];
    public MapView Map { get; init; }
}
