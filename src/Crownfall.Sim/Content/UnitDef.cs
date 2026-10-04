using Crownfall.Sim.Core;
using Newtonsoft.Json;

namespace Crownfall.Sim.Content;

public sealed class UnitDef
{
    public string Id { get; set; }
    public string Name { get; set; }

    /// <summary>Id of the model the client draws, when the unit borrows another's until its own exists; null uses <see cref="Id"/>.</summary>
    public string Model { get; set; }

    public float Hp { get; set; }
    public float Attack { get; set; }
    public DamageType DamageType { get; set; }
    public float Range { get; set; }
    public float Cooldown { get; set; }
    public ArmorDef Armor { get; set; } = new();
    public float Speed { get; set; }
    public int Sight { get; set; }

    /// <summary>Radius in which an idle or attack-moving unit picks fights; 0 uses <see cref="Sight"/>.</summary>
    public float AcquireRange { get; set; }
    public float Radius { get; set; }
    public Dictionary<string, int> Cost { get; set; } = [];
    public float TrainTime { get; set; }
    public int Pop { get; set; }
    public int Xp { get; set; }
    public List<string> Tags { get; set; } = [];
    public List<BonusDef> Bonus { get; set; } = [];
    public Dictionary<string, float> GatherRates { get; set; } = [];
    public float BuildRate { get; set; }
    public Dictionary<string, int> Bounty { get; set; } = [];
    public GrowthDef Growth { get; set; }

    [JsonIgnore]
    public int Kind { get; internal set; }

    [JsonIgnore]
    public int[] CostAmounts { get; internal set; }

    [JsonIgnore]
    public int[] BountyAmounts { get; internal set; }

    [JsonIgnore]
    public float[] GatherRateByType { get; internal set; }

    [JsonIgnore]
    public bool IsVillager { get; internal set; }

    [JsonIgnore]
    public bool IsHero { get; internal set; }

    [JsonIgnore]
    public bool IsCreep { get; internal set; }

    [JsonIgnore]
    public bool IsMilitary { get; internal set; }

    [JsonIgnore]
    public bool IsRanged => Range > 1.5f;

    [JsonIgnore]
    public float Acquire => AcquireRange > 0 ? AcquireRange : Sight;

    public bool HasTag(string tag)
    {
        return Tags.Contains(tag);
    }

    public float GatherRate(ResourceType type)
    {
        return GatherRateByType[(int)type];
    }
}
