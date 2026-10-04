using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Events;

public sealed class DefeatEvent : GameEvent
{
    public override string Kind => "defeat";
    public int Player { get; init; }
    public string Name { get; init; }

    public override bool IsVisibleTo(Game game, Player viewer)
    {
        return true;
    }
}
