namespace Crownfall.Server.Protocol;

public sealed record PingRequest(double ClientTime) : ClientMessage;
