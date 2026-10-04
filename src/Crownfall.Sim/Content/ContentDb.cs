using Crownfall.Sim.Core;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace Crownfall.Sim.Content;

/// <summary>
/// Indexed view of content/game.json. Kind ids number units, then buildings, then nodes in file order;
/// the client derives the same numbering from the same file, so the order is part of the wire protocol.
/// </summary>
public sealed class ContentDb
{
    private const int MaxKinds = 255;

    private readonly Dictionary<string, UnitDef> _units;
    private readonly Dictionary<string, BuildingDef> _buildings;
    private readonly Dictionary<string, NodeDef> _nodes;
    private readonly Dictionary<string, RaceDef> _races;
    private int[] _heroReviveBase;
    private int[] _heroRevivePerLevel;

    private ContentDb(GameContent content)
    {
        Content = content;
        _units = content.Units.ToDictionary(u => u.Id);
        _buildings = content.Buildings.ToDictionary(b => b.Id);
        _nodes = content.Nodes.ToDictionary(n => n.Id);
        _races = content.Races.ToDictionary(r => r.Id);
        Index();
    }

    public GameContent Content { get; }
    public RulesDef Rules => Content.Rules;
    public IReadOnlyList<UnitDef> Units => Content.Units;
    public IReadOnlyList<BuildingDef> Buildings => Content.Buildings;
    public IReadOnlyList<NodeDef> Nodes => Content.Nodes;
    public IReadOnlyList<RaceDef> Races => Content.Races;
    public IReadOnlyList<AbilityDef> Abilities => Content.Abilities;
    public IReadOnlyList<HeroStatDef> HeroStats => Content.HeroStats;
    public float TickSeconds => 1f / Rules.TickRate;
    public int[] StartingResources { get; private set; }

    /// <summary>Market base mid prices by resource; 0 for resources the market does not trade.</summary>
    public float[] MarketBasePrices { get; private set; }

    public static ContentDb Load(string path)
    {
        return Parse(File.ReadAllText(path));
    }

    public static ContentDb Parse(string json)
    {
        var settings = new JsonSerializerSettings
        {
            ContractResolver = new DefaultContractResolver { NamingStrategy = new CamelCaseNamingStrategy() },
            MissingMemberHandling = MissingMemberHandling.Error,
        };
        var content = JsonConvert.DeserializeObject<GameContent>(json, settings);
        return new ContentDb(content);
    }

    /// <summary>Finds content/game.json by walking up from the app's base directory.</summary>
    public static string FindDefaultPath()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null)
        {
            var candidate = Path.Combine(directory.FullName, "content", "game.json");
            if (File.Exists(candidate))
            {
                return candidate;
            }
            directory = directory.Parent;
        }
        throw new FileNotFoundException("content/game.json was not found above " + AppContext.BaseDirectory);
    }

    public UnitDef Unit(string id)
    {
        return _units.TryGetValue(id, out var def) ? def : throw new KeyNotFoundException($"Unknown unit '{id}'.");
    }

    public BuildingDef Building(string id)
    {
        return _buildings.TryGetValue(id, out var def) ? def : throw new KeyNotFoundException($"Unknown building '{id}'.");
    }

    public NodeDef Node(string id)
    {
        return _nodes.TryGetValue(id, out var def) ? def : throw new KeyNotFoundException($"Unknown node '{id}'.");
    }

    public RaceDef Race(string id)
    {
        return _races.TryGetValue(id, out var def) ? def : throw new KeyNotFoundException($"Unknown race '{id}'.");
    }

    public bool TryGetUnit(string id, out UnitDef def)
    {
        def = null;
        return id != null && _units.TryGetValue(id, out def);
    }

    public bool TryGetBuilding(string id, out BuildingDef def)
    {
        def = null;
        return id != null && _buildings.TryGetValue(id, out def);
    }

    public bool HasRace(string id)
    {
        return id != null && _races.ContainsKey(id);
    }

    public AbilityDef Ability(int slot)
    {
        return slot >= 0 && slot < Abilities.Count ? Abilities[slot] : null;
    }

    /// <summary>Index of a hero stat by id, or -1.</summary>
    public int HeroStatIndex(string id)
    {
        for (var i = 0; i < HeroStats.Count; i++)
        {
            if (HeroStats[i].Id == id)
            {
                return i;
            }
        }
        return -1;
    }

    /// <summary>What reviving a fallen hero of this level costs: a base price plus a per-level step, compounded per level.</summary>
    public int[] HeroReviveCost(int level)
    {
        var levels = level - 1;
        var growth = MathF.Pow(Rules.HeroReviveCostGrowth, levels);
        var cost = new int[Resources.Count];
        for (var i = 0; i < Resources.Count; i++)
        {
            cost[i] = (int)MathF.Round((_heroReviveBase[i] + _heroRevivePerLevel[i] * levels) * growth);
        }
        return cost;
    }

    private static List<BuildingStats> ResolveLevels(BuildingDef building)
    {
        var levels = new List<BuildingStats> { BuildingStats.Base(building) };
        foreach (var step in building.Levels)
        {
            if (step.Time <= 0)
            {
                throw new InvalidDataException($"Building '{building.Id}' level {levels.Count + 1} needs a positive time.");
            }
            levels.Add(levels[^1].Next(step));
        }
        return levels;
    }

    private void Index()
    {
        var kind = 0;
        foreach (var unit in Content.Units)
        {
            unit.Kind = kind++;
            unit.CostAmounts = Resources.FromDictionary(unit.Cost);
            unit.BountyAmounts = Resources.FromDictionary(unit.Bounty);
            unit.GatherRateByType = new float[Resources.Count];
            foreach (var pair in unit.GatherRates)
            {
                unit.GatherRateByType[(int)Resources.Parse(pair.Key)] = pair.Value;
            }
            unit.IsVillager = unit.HasTag("villager");
            unit.IsHero = unit.HasTag("hero");
            unit.IsCreep = unit.HasTag("creep");
            unit.IsMilitary = unit.HasTag("military");
        }
        foreach (var building in Content.Buildings)
        {
            building.Kind = kind++;
            building.CostAmounts = Resources.FromDictionary(building.Cost);
            building.AcceptsDropOff = new bool[Resources.Count];
            foreach (var resource in building.DropOff)
            {
                building.AcceptsDropOff[(int)Resources.Parse(resource)] = true;
            }
            building.IsDropOff = building.DropOff.Count > 0;
            building.IsTownCenter = building.Tags.Contains("townCenter");
            building.TrainableUnits = building.Trains.Select(Unit).ToList();
            building.Stats = ResolveLevels(building);
        }
        foreach (var node in Content.Nodes)
        {
            node.Kind = kind++;
            node.ResourceType = Resources.Parse(node.Resource);
        }
        if (kind > MaxKinds)
        {
            throw new InvalidDataException($"Content defines {kind} kinds; the protocol supports {MaxKinds}.");
        }
        foreach (var race in Content.Races)
        {
            race.HeroUnit = Unit(race.Hero);
        }
        StartingResources = Resources.FromDictionary(Rules.StartingResources);
        MarketBasePrices = Array.ConvertAll(Resources.FromDictionary(Rules.Market.Prices), price => (float)price);
        _heroReviveBase = Resources.FromDictionary(Rules.HeroReviveCost);
        _heroRevivePerLevel = Resources.FromDictionary(Rules.HeroReviveCostPerLevel);
        foreach (var stat in Content.HeroStats)
        {
            stat.Effect = Enum.TryParse<HeroStatEffect>(stat.Id, ignoreCase: true, out var effect)
                ? effect
                : throw new InvalidDataException($"Unknown hero stat '{stat.Id}'.");
        }
    }
}
