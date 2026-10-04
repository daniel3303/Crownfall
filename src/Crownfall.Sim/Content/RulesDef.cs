namespace Crownfall.Sim.Content;

public sealed class RulesDef
{
    public int TickRate { get; set; }
    public Dictionary<string, int> StartingResources { get; set; } = [];
    public int StartingVillagers { get; set; }
    public int PopulationLimit { get; set; }
    public float CarryCapacity { get; set; }
    public float TributeTax { get; set; }
    public float ProjectileSpeed { get; set; }
    public int TreeWood { get; set; }
    /// <summary>Total experience needed to reach each level, from level 1; levels past the table keep going.</summary>
    public List<int> HeroXpLevels { get; set; } = [];

    /// <summary>Past the table, each level's experience step grows by this much over the previous step.</summary>
    public int HeroXpStepGrowth { get; set; }
    /// <summary>Tiles from a death within which allied heroes share its experience.</summary>
    public float HeroXpRadius { get; set; }

    /// <summary>Experience a slain hero is worth by its level; past the table each level adds <see cref="HeroKillXpPerLevel"/>.</summary>
    public List<int> HeroKillXp { get; set; } = [];

    public int HeroKillXpPerLevel { get; set; }

    /// <summary>Share of the solo hero-kill bounty that several sharing heroes split, by the victim's level; the last entry holds beyond.</summary>
    public List<float> HeroSharedKillXpShare { get; set; } = [];

    /// <summary>Experience change per decimal level of difference beyond the first, between a slain hero and each earner.</summary>
    public float HeroKillXpLevelStep { get; set; }

    public float HeroKillXpMaxBonus { get; set; }
    public float HeroKillXpMaxPenalty { get; set; }

    /// <summary>Total share of a unit or building's experience when two or more heroes split it.</summary>
    public float SharedXpTotal { get; set; }

    /// <summary>Seconds a fallen hero waits before it can be revived, plus <see cref="HeroRespawnPerLevel"/> per level.</summary>
    public float HeroRespawnSeconds { get; set; }

    public float HeroRespawnPerLevel { get; set; }
    public Dictionary<string, int> HeroReviveCost { get; set; } = [];
    public Dictionary<string, int> HeroReviveCostPerLevel { get; set; } = [];

    /// <summary>Compound rise of the revive price per level on top of its per-level step, so high levels cost ever more.</summary>
    public float HeroReviveCostGrowth { get; set; } = 1f;

    /// <summary>Gold an enemy earns for slaying a level 1 hero, plus <see cref="HeroKillGoldPerLevel"/> per level above.</summary>
    public int HeroKillGold { get; set; }

    public int HeroKillGoldPerLevel { get; set; }

    /// <summary>Extra gold for the match's first hero slain by an enemy.</summary>
    public int FirstBloodGold { get; set; }

    /// <summary>A slain hero's kill streak from which its killer earns the shutdown bonus.</summary>
    public int HeroShutdownStreak { get; set; }

    /// <summary>Shutdown bonus at <see cref="HeroShutdownStreak"/>, plus <see cref="HeroShutdownGoldPerKill"/> per kill above it.</summary>
    public int HeroShutdownGold { get; set; }

    public int HeroShutdownGoldPerKill { get; set; }

    /// <summary>Announced streak tiers, fewest kills first; the last repeats for every kill beyond it.</summary>
    public List<KillStreakDef> KillStreaks { get; set; } = [];

    /// <summary>Share an ability's cooldown shrinks per hero level above the first, up to <see cref="HeroCooldownReductionMax"/>.</summary>
    public float HeroCooldownReductionPerLevel { get; set; }

    public float HeroCooldownReductionMax { get; set; }

    /// <summary>Most a hero's cooldowns can shrink from its level and its items together.</summary>
    public float HeroCooldownReductionCap { get; set; }

    public int HeroInventorySlots { get; set; }

    /// <summary>Tiles from one of its owner's completed town centers within which a living hero can buy and sell items.</summary>
    public float ItemShopRange { get; set; }

    /// <summary>Share of an item's price a sale refunds.</summary>
    public float ItemSellRefund { get; set; }

    /// <summary>Seconds without taking damage before a hero starts to regenerate.</summary>
    public float HeroRegenDelaySeconds { get; set; }

    /// <summary>Share of max hp a resting hero regains per second.</summary>
    public float HeroRegenPerSecond { get; set; }
    public int BuildingXp { get; set; }
    public float CampRespawnSeconds { get; set; }
    public float CreepAggroRange { get; set; }
    public float CreepLeashRange { get; set; }

    /// <summary>The center boss; null for a map without one.</summary>
    public DragonDef Dragon { get; set; }
    public float UnderAttackNoticeSeconds { get; set; }

    /// <summary>Least seconds between two "storage full" notices to one player.</summary>
    public float StorageFullNoticeSeconds { get; set; }

    /// <summary>Resources per second one villager steals from an enemy drop-off.</summary>
    public float StealRate { get; set; }

    /// <summary>Least seconds between two raid warnings to the robbed player.</summary>
    public float RaidNoticeSeconds { get; set; }

    public MarketDef Market { get; set; } = new();

    /// <summary>
    /// What an ability's cooldown is multiplied by for a hero of this level holding items that take
    /// <paramref name="itemReduction"/> off: the level share is capped on its own, then both together.
    /// </summary>
    public float HeroCooldownFactor(int level, float itemReduction = 0)
    {
        var fromLevel = MathF.Min(HeroCooldownReductionMax, HeroCooldownReductionPerLevel * Math.Max(0, level - 1));
        return 1 - MathF.Min(MathF.Max(HeroCooldownReductionMax, HeroCooldownReductionCap), fromLevel + itemReduction);
    }

    /// <summary>Total experience to reach a level. Hero levels have no cap: steps keep growing past the table.</summary>
    public int HeroXpForLevel(int level)
    {
        var table = HeroXpLevels;
        if (level <= table.Count)
        {
            return table[Math.Max(0, level - 1)];
        }
        long lastStep = table.Count > 1 ? table[^1] - table[^2] : HeroXpStepGrowth;
        long beyond = level - table.Count;
        // Arithmetic series: steps lastStep + g, lastStep + 2g, ... for each level past the table.
        var total = table[^1] + beyond * lastStep + HeroXpStepGrowth * beyond * (beyond + 1) / 2;
        return (int)Math.Min(int.MaxValue, total);
    }
}
