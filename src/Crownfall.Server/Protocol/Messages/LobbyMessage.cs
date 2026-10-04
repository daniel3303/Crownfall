using Crownfall.Sim.Core;

namespace Crownfall.Server.Protocol.Messages;

public sealed class LobbyMessage : ServerMessage
{
    public override string T => "lobby";
    public string MatchId { get; init; }
    public string Phase { get; init; }
    public int You { get; init; }
    public MatchConfig Config { get; init; }
    public List<SeatView> Seats { get; init; } = [];
}
