namespace Crownfall.Server.Protocol.Messages;

public sealed class ErrorMessage : ServerMessage
{
    public override string T => "error";
    public string Message { get; init; }
}
