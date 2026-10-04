using Crownfall.Sim.Content;

namespace Crownfall.Sim.Entities;

/// <summary>
/// Hero progress that survives the hero's death: level, XP, stat ranks, unspent points, ability cooldowns and the items
/// it carries. Its kill streak is the one thing a death ends.
/// </summary>
public sealed class HeroState
{
    public HeroState(UnitDef def, int abilityCount, IReadOnlyList<HeroStatDef> stats, int inventorySlots)
    {
        Def = def;
        Cooldowns = new float[abilityCount];
        Stats = stats;
        Ranks = new int[stats.Count];
        Items = new ItemDef[inventorySlots];
    }

    public UnitDef Def { get; }
    public int Level { get; set; } = 1;
    public int Xp { get; set; }
    public float[] Cooldowns { get; }
    public IReadOnlyList<HeroStatDef> Stats { get; }

    /// <summary>Points spent per stat, in content order.</summary>
    public int[] Ranks { get; }

    /// <summary>Inventory slots; null where a slot is empty.</summary>
    public ItemDef[] Items { get; }

    /// <summary>Level-up points not yet spent; they bank until the player picks a stat.</summary>
    public int UnspentPoints { get; set; }

    /// <summary>Tick at which a fallen hero may be revived; -1 while alive.</summary>
    public int ReviveTick { get; set; } = -1;

    /// <summary>Enemy heroes its player has slain since this hero last died.</summary>
    public int KillStreak { get; set; }

    public float BonusHp => LevelGrowth(Def.Growth?.Hp ?? 0, Level) + StatBonus(HeroStatEffect.MaxHealth) + ItemBonus(i => i.Hp);
    public float BonusAttack => LevelGrowth(Def.Growth?.Attack ?? 0, Level) + StatBonus(HeroStatEffect.AttackDamage) + ItemBonus(i => i.Attack);

    /// <summary>Max hp the latest level added; it rises with every level.</summary>
    public float LevelUpHp => LevelGrowth(Def.Growth?.Hp ?? 0, Level) - LevelGrowth(Def.Growth?.Hp ?? 0, Level - 1);
    public float AttackSpeedBonus => StatBonus(HeroStatEffect.AttackSpeed) + ItemBonus(i => i.AttackSpeed);
    public float MoveSpeedBonus => StatBonus(HeroStatEffect.MoveSpeed) + ItemBonus(i => i.MoveSpeed);
    public float LifeSteal => StatBonus(HeroStatEffect.LifeSteal) + ItemBonus(i => i.LifeSteal);

    /// <summary>Hp per second the hero's items heal, whether or not it is resting.</summary>
    public float ItemRegen => ItemBonus(i => i.Regen);

    /// <summary>Share the hero's items take off ability cooldowns, before the overall cap.</summary>
    public float ItemCooldownReduction => ItemBonus(i => i.CooldownReduction);

    public bool HasFreeSlot => Array.IndexOf(Items, null) >= 0;

    private float LevelGrowth(float perLevel, int level) => Def.Growth?.Total(perLevel, level) ?? 0;

    /// <summary>Armor the hero's items add against one kind of damage.</summary>
    public float ArmorBonus(DamageType type)
    {
        return ItemBonus(i => i.Armor.Against(type));
    }

    public bool Holds(ItemDef item)
    {
        return Array.IndexOf(Items, item) >= 0;
    }

    /// <summary>The total an effect gains from spent ranks.</summary>
    public float StatBonus(HeroStatEffect effect)
    {
        var total = 0f;
        for (var i = 0; i < Stats.Count; i++)
        {
            if (Stats[i].Effect == effect)
            {
                total += Ranks[i] * Stats[i].PerRank;
            }
        }
        return total;
    }

    private float ItemBonus(Func<ItemDef, float> stat)
    {
        var total = 0f;
        foreach (var item in Items)
        {
            if (item != null)
            {
                total += stat(item);
            }
        }
        return total;
    }
}
