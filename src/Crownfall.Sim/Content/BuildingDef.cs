using Crownfall.Sim.Core;
using Newtonsoft.Json;

namespace Crownfall.Sim.Content;

public sealed class BuildingDef
{
    public string Id { get; set; }
    public string Name { get; set; }
    public int Size { get; set; }
    public float Hp { get; set; }
    public ArmorDef Armor { get; set; } = new();
    public int Sight { get; set; }
    public Dictionary<string, int> Cost { get; set; } = [];
    public float BuildTime { get; set; }
    public int Pop { get; set; }
    public List<string> DropOff { get; set; } = [];
    public List<string> Trains { get; set; } = [];
    public AttackDef Attack { get; set; }
    public bool Walkable { get; set; }
    public float FoodRate { get; set; }

    /// <summary>How much of each resource the building lets its owner store once complete.</summary>
    public int Storage { get; set; }

    /// <summary>True when the owner can trade resources for gold here.</summary>
    public bool Market { get; set; }

    /// <summary>Training speed multiplier; upgrades raise it.</summary>
    public float TrainSpeed { get; set; } = 1;

    /// <summary>Upgrade steps for levels 2 and up, in order.</summary>
    public List<BuildingLevelDef> Levels { get; set; } = [];

    public List<string> Tags { get; set; } = [];
    public string Hotkey { get; set; }

    [JsonIgnore]
    public int Kind { get; internal set; }

    [JsonIgnore]
    public int[] CostAmounts { get; internal set; }

    [JsonIgnore]
    public bool[] AcceptsDropOff { get; internal set; }

    [JsonIgnore]
    public List<UnitDef> TrainableUnits { get; internal set; } = [];

    [JsonIgnore]
    public bool IsTownCenter { get; internal set; }

    [JsonIgnore]
    public bool IsFarm => FoodRate > 0;

    /// <summary>Walls, gates and wall towers: enemies path into them to break through.</summary>
    [JsonIgnore]
    public bool IsWall => Tags.Contains("wall");

    [JsonIgnore]
    public bool IsGate => Tags.Contains("gate");

    /// <summary>Placed by dragging a line of single tiles.</summary>
    [JsonIgnore]
    public bool IsLine => Tags.Contains("line");

    /// <summary>Resolved stats per level; index 0 is level 1.</summary>
    [JsonIgnore]
    public List<BuildingStats> Stats { get; internal set; } = [];

    [JsonIgnore]
    public int MaxLevel => Stats.Count;

    [JsonIgnore]
    public bool IsDropOff { get; internal set; }

    public BuildingStats StatsAt(int level)
    {
        return Stats[Math.Clamp(level, 1, Stats.Count) - 1];
    }

    public bool Accepts(ResourceType type)
    {
        return AcceptsDropOff[(int)type];
    }
}
