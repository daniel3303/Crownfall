using System.Numerics;

namespace Crownfall.Sim.Bots;

/// <summary>A neutral camp a bot has seen, with when it last saw creeps there and when it last saw it empty.</summary>
public sealed class KnownCamp
{
    public int Id { get; init; }
    public Vector2 Center { get; init; }
    public bool HasBoss { get; set; }
    public int LastAliveTick { get; set; } = -1;
    public int LastEmptyTick { get; set; } = -1;
}
