namespace Crownfall.Server.Matches;

public sealed record LeaveInbound(IMatchClient Client) : Inbound(Client);
