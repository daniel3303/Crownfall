using System.Numerics;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>Visible enemy fighters inside a bot's base or on its villagers during one think.</summary>
public sealed class BotThreat
{
    public List<Unit> Attackers { get; } = [];
    public Vector2 Center { get; set; }
    public float Power { get; set; }
    public bool IsActive => Attackers.Count > 0;
}
