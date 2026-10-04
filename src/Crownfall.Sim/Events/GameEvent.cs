using Crownfall.Sim.Entities;
using Newtonsoft.Json;

namespace Crownfall.Sim.Events;

/// <summary>Something clients should animate or announce. Each event decides who may see it.</summary>
public abstract class GameEvent
{
    [JsonProperty("k", Order = -2)]
    public abstract string Kind { get; }

    public abstract bool IsVisibleTo(Game game, Player viewer);
}
