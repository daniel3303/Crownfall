using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>A visible enemy hero whose area ability around itself is ready, with its reach and damage.</summary>
public readonly record struct AreaThreat(Unit Hero, float Radius, float Damage);
