using Crownfall.Sim.Events;

namespace Crownfall.Server.Protocol.Messages;

public sealed class EventsMessage : ServerMessage
{
    public override string T => "events";
    public int Tick { get; init; }
    public List<GameEvent> Events { get; init; } = [];
}
