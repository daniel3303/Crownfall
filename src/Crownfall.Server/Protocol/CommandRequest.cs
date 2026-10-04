using Crownfall.Sim.Commands;

namespace Crownfall.Server.Protocol;

public sealed record CommandRequest(PlayerCommand Command) : ClientMessage;
