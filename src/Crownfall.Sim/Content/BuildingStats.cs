namespace Crownfall.Sim.Content;

/// <summary>A building's resolved stats at one level, with what the upgrade into that level costs.</summary>
public sealed class BuildingStats
{
    public int Level { get; init; }
    public float Hp { get; init; }
    public ArmorDef Armor { get; init; }
    public int Sight { get; init; }
    public int Pop { get; init; }
    public AttackDef Attack { get; init; }
    public float FoodRate { get; init; }

    /// <summary>Training runs this many times faster than the unit's base train time.</summary>
    public float TrainSpeed { get; init; }

    /// <summary>How much of each resource the building lets its owner store.</summary>
    public int Storage { get; init; }

    /// <summary>Health and attack multipliers for units trained at this level; 1 when the building drills no troops.</summary>
    public float TroopHp { get; init; }

    public float TroopAttack { get; init; }

    /// <summary>The price of upgrading into this level; empty at level 1.</summary>
    public int[] UpgradeCost { get; init; }

    public float UpgradeSeconds { get; init; }
    public int TownCenterLevel { get; init; }

    public static BuildingStats Base(BuildingDef def)
    {
        return new BuildingStats
        {
            Level = 1,
            Hp = def.Hp,
            Armor = def.Armor,
            Sight = def.Sight,
            Pop = def.Pop,
            Attack = def.Attack,
            FoodRate = def.FoodRate,
            TrainSpeed = def.TrainSpeed,
            Storage = def.Storage,
            TroopHp = 1,
            TroopAttack = 1,
            UpgradeCost = new int[Core.Resources.Count],
        };
    }

    /// <summary>The next level: every stat the step names replaces this level's value.</summary>
    public BuildingStats Next(BuildingLevelDef step)
    {
        return new BuildingStats
        {
            Level = Level + 1,
            Hp = step.Hp ?? Hp,
            Armor = step.Armor ?? Armor,
            Sight = step.Sight ?? Sight,
            Pop = step.Pop ?? Pop,
            Attack = step.Attack ?? Attack,
            FoodRate = step.FoodRate ?? FoodRate,
            TrainSpeed = step.TrainSpeed ?? TrainSpeed,
            Storage = step.Storage ?? Storage,
            TroopHp = step.TroopHp ?? TroopHp,
            TroopAttack = step.TroopAttack ?? TroopAttack,
            UpgradeCost = Core.Resources.FromDictionary(step.Cost),
            UpgradeSeconds = step.Time,
            TownCenterLevel = step.TownCenterLevel,
        };
    }
}
