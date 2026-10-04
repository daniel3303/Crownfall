using Crownfall.Sim.Entities;

namespace Crownfall.Server.Matches;

/// <summary>A lobby slot. Seats without a client are played by bots.</summary>
public sealed class Seat
{
    public int Index { get; init; }
    public int Team { get; init; }
    public string BotName { get; init; }
    public string Name { get; set; }
    public string Race { get; set; }
    public IMatchClient Client { get; set; }
    public Player Player { get; set; }

    public bool IsBot => Client == null;
}
