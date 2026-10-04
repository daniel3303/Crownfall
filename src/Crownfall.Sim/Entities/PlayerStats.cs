namespace Crownfall.Sim.Entities;

public sealed class PlayerStats
{
    public int Gathered { get; set; }
    public int KillValue { get; set; }
    public int Kills { get; set; }
    public int Losses { get; set; }
    public int UnitsTrained { get; set; }
    public int BuildingsBuilt { get; set; }

    public int Score => Gathered + KillValue;
}
