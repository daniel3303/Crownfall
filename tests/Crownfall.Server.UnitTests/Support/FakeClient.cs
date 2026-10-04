using Crownfall.Server.Matches;
using Crownfall.Server.Protocol.Messages;

namespace Crownfall.Server.UnitTests.Support;

internal sealed class FakeClient : IMatchClient
{
    public List<ServerMessage> Messages { get; } = [];
    public int Snapshots { get; private set; }
    public string ClosedWith { get; private set; }

    public void Send(ServerMessage message)
    {
        Messages.Add(message);
    }

    public void SendSnapshot(byte[] snapshot)
    {
        Snapshots++;
    }

    public void Close(string reason)
    {
        ClosedWith = reason;
    }

    public T Last<T>() where T : ServerMessage
    {
        return Messages.OfType<T>().Last();
    }
}
