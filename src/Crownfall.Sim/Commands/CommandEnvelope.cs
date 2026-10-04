namespace Crownfall.Sim.Commands;

/// <summary>A command tagged with the index of the player who issued it.</summary>
public sealed record CommandEnvelope(int PlayerIndex, PlayerCommand Command);
