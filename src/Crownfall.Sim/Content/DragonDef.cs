namespace Crownfall.Sim.Content;

/// <summary>The boss that lands at the map center: when it first appears, how soon it returns, and what slaying it pays.</summary>
public sealed class DragonDef
{
    /// <summary>Unit id of the boss.</summary>
    public string Unit { get; set; }

    public float SpawnSeconds { get; set; }
    public float RespawnSeconds { get; set; }

    /// <summary>Gold every stockpile on the slaying team receives.</summary>
    public int Gold { get; set; }

    /// <summary>Seconds the slaying team's units deal <see cref="BuffAttack"/> more attack damage.</summary>
    public float BuffSeconds { get; set; }

    public float BuffAttack { get; set; }

    /// <summary>How far the dragon chases from its lair; wider than a camp's, so its fight has room around the lair.</summary>
    public float LeashRange { get; set; }
}
