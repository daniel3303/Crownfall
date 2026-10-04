using System.Numerics;

namespace Crownfall.Sim.Bots;

/// <summary>A neutral camp a bot has seen, with when it last saw creeps there and when it last saw it empty.</summary>
public sealed class KnownCamp
{
    public int Id { get; init; }
    public Vector2 Center { get; init; }
    public bool HasBoss { get; set; }

    /// <summary>The boss here fights only what attacks it, so paths need not bend around it.</summary>
    public bool IsPassive { get; set; }

    /// <summary>Seconds the camp takes to fill again once emptied.</summary>
    public float RespawnSeconds { get; set; }
    public int LastAliveTick { get; set; } = -1;
    public int LastEmptyTick { get; set; } = -1;
}
