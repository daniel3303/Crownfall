namespace Crownfall.Sim.Core;

/// <summary>One seat when a game starts.</summary>
public sealed class PlayerSetup
{
    public string Name { get; init; }
    public int Team { get; init; }
    public string Race { get; init; }
    public bool IsBot { get; init; }

    /// <summary>Id of the race's hero the seat leads; null for the race's classic hero.</summary>
    public string Hero { get; init; }
}
