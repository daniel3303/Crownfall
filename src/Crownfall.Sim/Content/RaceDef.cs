using Newtonsoft.Json;

namespace Crownfall.Sim.Content;

public sealed class RaceDef
{
    public string Id { get; set; }
    public string Name { get; set; }
    public string Hero { get; set; }
    public string Description { get; set; }
    public float GatherMultiplier { get; set; } = 1;
    public float BuildingHpMultiplier { get; set; } = 1;
    public float MilitaryHpMultiplier { get; set; } = 1;
    public float TrainTimeMultiplier { get; set; } = 1;

    [JsonIgnore]
    public UnitDef HeroUnit { get; internal set; }
}
