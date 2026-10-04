using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Events;

public sealed class DepositEvent : GameEvent
{
    public override string Kind => "deposit";
    public int Player { get; init; }
    public float X { get; init; }
    public float Y { get; init; }
    public ResourceType Resource { get; init; }
    public int Amount { get; init; }

    public override bool IsVisibleTo(Game game, Player viewer)
    {
        return viewer.Index == Player;
    }
}
