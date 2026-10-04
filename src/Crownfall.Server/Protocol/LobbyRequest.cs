namespace Crownfall.Server.Protocol;

public sealed record LobbyRequest(LobbyAction Action, int Team, string Race, string Name = null, string Hero = null) : ClientMessage;
