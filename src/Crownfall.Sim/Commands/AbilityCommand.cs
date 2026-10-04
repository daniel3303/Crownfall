namespace Crownfall.Sim.Commands;

/// <summary>Casts the player's hero ability in Slot; X/Y is the target point for targeted abilities.</summary>
public sealed class AbilityCommand : PlayerCommand
{
    public int Slot { get; set; }
    public float X { get; set; }
    public float Y { get; set; }
}
