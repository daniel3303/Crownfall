namespace Crownfall.Server.Matches;

/// <summary>A client asking for a seat. Race is null when the client did not pick a valid one.</summary>
public sealed record JoinInbound(IMatchClient Client, string Name, string Race) : Inbound(Client);
