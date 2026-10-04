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

    /// <summary>Radius around the target within which each basic attack also hits every other enemy unit; 0 for none.</summary>
    public float Splash { get; set; }
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

    /// <summary>A hero's ability ids in key order, Q first; each id names an entry of the content's ability pool.</summary>
    public List<string> Abilities { get; set; } = [];

    /// <summary>A hero's talent tiers, one per <see cref="RulesDef.HeroTalentLevels"/> entry, each a choice of options.</summary>
    public List<List<TalentDef>> Talents { get; set; } = [];

    /// <summary>Races that may train the unit; empty for every race.</summary>
    public List<string> Races { get; set; } = [];

    /// <summary>Level the training building must have reached before it trains the unit; 0 or 1 for none.</summary>
    public int RequiresTrainerLevel { get; set; }

    [JsonIgnore]
    public int Kind { get; internal set; }

    /// <summary>The hero's abilities resolved from <see cref="Abilities"/>; a slot is an index into it.</summary>
    [JsonIgnore]
    public List<AbilityDef> Kit { get; internal set; } = [];

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

    /// <summary>A creep that fights only what attacks it and that units never pick as a target on their own.</summary>
    [JsonIgnore]
    public bool IsPassive { get; internal set; }

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

    public bool AllowsRace(string race)
    {
        return Races.Count == 0 || Races.Contains(race);
    }

    /// <summary>True when a building of this level may train the unit.</summary>
    public bool TrainsAtLevel(int level)
    {
        return level >= RequiresTrainerLevel;
    }

    public float GatherRate(ResourceType type)
    {
        return GatherRateByType[(int)type];
    }
}
