namespace Crownfall.Server.Protocol.Messages;

public sealed class PongMessage : ServerMessage
{
    public override string T => "pong";
    public double C { get; init; }
}
