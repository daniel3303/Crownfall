using Crownfall.Server.Protocol.Messages;

namespace Crownfall.Server.Matches;

/// <summary>The match host's view of a connected player; lets lobby logic be tested without sockets.</summary>
public interface IMatchClient
{
    void Send(ServerMessage message);
    void SendSnapshot(byte[] snapshot);
    void Close(string reason);
}
