namespace Crownfall.Sim.Content;

/// <summary>A named run of enemy heroes slain without dying, announced to everyone when a hero reaches it.</summary>
public sealed class KillStreakDef
{
    public int Kills { get; set; }
    public string Title { get; set; }
}
