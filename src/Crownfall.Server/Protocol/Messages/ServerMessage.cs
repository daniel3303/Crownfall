namespace Crownfall.Server.Protocol.Messages;

/// <summary>A JSON text frame to the client; <see cref="T"/> names the message type.</summary>
public abstract class ServerMessage
{
    public abstract string T { get; }
}
