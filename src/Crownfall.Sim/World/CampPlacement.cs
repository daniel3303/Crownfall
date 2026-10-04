using System.Numerics;

namespace Crownfall.Sim.World;

/// <summary>A neutral creep camp: its center and the unit ids that spawn there.</summary>
public sealed record CampPlacement(Vector2 Center, IReadOnlyList<string> Members);
