using Newtonsoft.Json;

namespace Crownfall.Sim.Content;

public sealed class RaceDef
{
    public string Id { get; set; }
    public string Name { get; set; }

    /// <summary>The classic hero, which a seat leads when it picks none.</summary>
    public string Hero { get; set; }

    /// <summary>Every hero a seat of this race may pick, the classic one included.</summary>
    public List<string> Heroes { get; set; } = [];
    public string Description { get; set; }
    public float GatherMultiplier { get; set; } = 1;
    public float BuildingHpMultiplier { get; set; } = 1;
    public float MilitaryHpMultiplier { get; set; } = 1;
    public float TrainTimeMultiplier { get; set; } = 1;

    [JsonIgnore]
    public UnitDef HeroUnit { get; internal set; }

    [JsonIgnore]
    public List<UnitDef> HeroUnits { get; internal set; } = [];

    /// <summary>The race's hero with this id, or null when the race cannot field it.</summary>
    public UnitDef FindHero(string id)
    {
        return HeroUnits.FirstOrDefault(h => h.Id == id);
    }
}
