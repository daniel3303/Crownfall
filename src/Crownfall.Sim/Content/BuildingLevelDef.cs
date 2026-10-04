namespace Crownfall.Sim.Content;

/// <summary>
/// One upgrade step in game.json: what reaching the level costs and the stats that change there. A stat left out
/// keeps the previous level's value.
/// </summary>
public sealed class BuildingLevelDef
{
    public Dictionary<string, int> Cost { get; set; } = [];

    /// <summary>Seconds the upgrade takes.</summary>
    public float Time { get; set; }

    /// <summary>The town center level the owner must already hold, or 0 for none.</summary>
    public int TownCenterLevel { get; set; }

    public float? Hp { get; set; }
    public ArmorDef Armor { get; set; }
    public int? Sight { get; set; }
    public int? Pop { get; set; }
    public AttackDef Attack { get; set; }
    public float? FoodRate { get; set; }
    public float? TrainSpeed { get; set; }
    public int? Storage { get; set; }

    /// <summary>Health multiplier for units trained here once the building reaches this level.</summary>
    public float? TroopHp { get; set; }

    /// <summary>Attack multiplier for units trained here once the building reaches this level.</summary>
    public float? TroopAttack { get; set; }
}
