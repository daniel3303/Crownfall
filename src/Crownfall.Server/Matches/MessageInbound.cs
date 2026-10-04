using Crownfall.Server.Protocol;

namespace Crownfall.Server.Matches;

public sealed record MessageInbound(IMatchClient Client, ClientMessage Message) : Inbound(Client);
