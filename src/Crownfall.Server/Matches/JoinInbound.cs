namespace Crownfall.Server.Matches;

/// <summary>A client asking for a seat. Race is null when the client did not pick a valid one; Hero is the unchecked hero pick.</summary>
public sealed record JoinInbound(IMatchClient Client, string Name, string Race, string Hero = null) : Inbound(Client);
