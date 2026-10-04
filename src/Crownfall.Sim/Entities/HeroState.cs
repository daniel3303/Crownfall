using Crownfall.Sim.Content;

namespace Crownfall.Sim.Entities;

/// <summary>
/// Hero progress that survives the hero's death: level, XP, stat ranks, talents, unspent points, ability cooldowns and
/// the items it carries. Its kill streak is the one thing a death ends.
/// </summary>
public sealed class HeroState
{
    // Talents never take an ability's base cooldown below this many seconds.
    private const float MinBaseCooldown = 1f;

    public HeroState(UnitDef def, IReadOnlyList<HeroStatDef> stats, int inventorySlots, IReadOnlyList<int> talentLevels)
    {
        Def = def;
        Cooldowns = new float[def.Kit.Count];
        Stats = stats;
        Ranks = new int[stats.Count];
        Items = new ItemDef[inventorySlots];
        TalentLevels = talentLevels;
        Talents = new TalentDef[Math.Min(talentLevels.Count, def.Talents.Count)];
    }

    public UnitDef Def { get; }
    public int Level { get; set; } = 1;
    public int Xp { get; set; }

    /// <summary>Seconds left on each kit ability, by slot.</summary>
    public float[] Cooldowns { get; }
    public IReadOnlyList<HeroStatDef> Stats { get; }

    /// <summary>Points spent per stat, in content order.</summary>
    public int[] Ranks { get; }

    /// <summary>Inventory slots; null where a slot is empty.</summary>
    public ItemDef[] Items { get; }

    /// <summary>Hero level at which each talent tier opens.</summary>
    public IReadOnlyList<int> TalentLevels { get; }

    /// <summary>The talent picked in each tier; null until the player picks one.</summary>
    public TalentDef[] Talents { get; }

    /// <summary>Level-up points not yet spent; they bank until the player picks a stat.</summary>
    public int UnspentPoints { get; set; }

    /// <summary>Tick at which a fallen hero may be revived; -1 while alive.</summary>
    public int ReviveTick { get; set; } = -1;

    /// <summary>Enemy heroes its player has slain since this hero last died.</summary>
    public int KillStreak { get; set; }

    /// <summary>The hero's abilities by slot.</summary>
    public IReadOnlyList<AbilityDef> Kit => Def.Kit;

    public float BonusHp => LevelGrowth(Def.Growth?.Hp ?? 0, Level) + StatBonus(HeroStatEffect.MaxHealth) + ItemBonus(i => i.Hp) + TalentBonus(t => t.Hp);

    public float BonusAttack => LevelGrowth(Def.Growth?.Attack ?? 0, Level) + StatBonus(HeroStatEffect.AttackDamage) + ItemBonus(i => i.Attack)
        + TalentBonus(t => t.Attack);

    /// <summary>Max hp the latest level added; it rises with every level.</summary>
    public float LevelUpHp => LevelGrowth(Def.Growth?.Hp ?? 0, Level) - LevelGrowth(Def.Growth?.Hp ?? 0, Level - 1);
    public float AttackSpeedBonus => StatBonus(HeroStatEffect.AttackSpeed) + ItemBonus(i => i.AttackSpeed) + TalentBonus(t => t.AttackSpeed);
    public float MoveSpeedBonus => StatBonus(HeroStatEffect.MoveSpeed) + ItemBonus(i => i.MoveSpeed) + TalentBonus(t => t.MoveSpeed);
    public float LifeSteal => StatBonus(HeroStatEffect.LifeSteal) + ItemBonus(i => i.LifeSteal) + TalentBonus(t => t.LifeSteal);

    /// <summary>Hp per second the hero's items heal, whether or not it is resting.</summary>
    public float ItemRegen => ItemBonus(i => i.Regen);

    /// <summary>Share the hero's items take off ability cooldowns, before the overall cap.</summary>
    public float ItemCooldownReduction => ItemBonus(i => i.CooldownReduction);

    public bool HasFreeSlot => Array.IndexOf(Items, null) >= 0;

    /// <summary>The first tier the hero's level has opened but no talent fills yet, or -1.</summary>
    public int OpenTalentTier
    {
        get
        {
            for (var tier = 0; tier < Talents.Length; tier++)
            {
                if (Talents[tier] == null && Level >= TalentLevels[tier])
                {
                    return tier;
                }
            }
            return -1;
        }
    }

    /// <summary>True while nothing has been earned, spent or picked, so another hero could still take this one's place.</summary>
    public bool IsFresh => Xp == 0 && Level == 1 && UnspentPoints == 0 && Ranks.All(r => r == 0) && Items.All(i => i == null)
        && Talents.All(t => t == null);

    private float LevelGrowth(float perLevel, int level) => Def.Growth?.Total(perLevel, level) ?? 0;

    /// <summary>The kit ability in a slot, or null past the kit.</summary>
    public AbilityDef Ability(int slot)
    {
        return slot >= 0 && slot < Kit.Count ? Kit[slot] : null;
    }

    public float AbilityDamage(AbilityDef ability)
    {
        return ability.DamageAt(Level) * (1 + TalentModifier(ability, t => t.AbilityDamage));
    }

    public float AbilityHeal(AbilityDef ability)
    {
        return ability.HealAt(Level) * (1 + TalentModifier(ability, t => t.AbilityDamage));
    }

    public float AbilityRadius(AbilityDef ability)
    {
        return ability.Radius + TalentModifier(ability, t => t.Radius);
    }

    public float AbilityRange(AbilityDef ability)
    {
        return ability.Range + TalentModifier(ability, t => t.Range);
    }

    public float AbilityDuration(AbilityDef ability)
    {
        return ability.Duration + TalentModifier(ability, t => t.Duration);
    }

    public float AbilityStun(AbilityDef ability)
    {
        return ability.Stun + TalentModifier(ability, t => t.Stun);
    }

    /// <summary>Seconds the ability recharges for: its base less any talent seconds, then shortened by level and items.</summary>
    public float AbilityCooldown(AbilityDef ability, RulesDef rules)
    {
        var seconds = MathF.Max(MathF.Min(ability.Cooldown, MinBaseCooldown), ability.Cooldown - TalentModifier(ability, t => t.Cooldown));
        return seconds * rules.HeroCooldownFactor(Level, ItemCooldownReduction);
    }

    /// <summary>Armor the hero's items and talents add against one kind of damage.</summary>
    public float ArmorBonus(DamageType type)
    {
        return ItemBonus(i => i.Armor.Against(type)) + TalentBonus(t => t.Armor.Against(type));
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

    private float TalentBonus(Func<TalentDef, float> stat)
    {
        var total = 0f;
        foreach (var talent in Talents)
        {
            if (talent != null)
            {
                total += stat(talent);
            }
        }
        return total;
    }

    /// <summary>What the picked talents add to one modifier of one ability.</summary>
    private float TalentModifier(AbilityDef ability, Func<TalentDef, float> modifier)
    {
        var total = 0f;
        foreach (var talent in Talents)
        {
            if (talent != null && talent.Ability == ability.Id)
            {
                total += modifier(talent);
            }
        }
        return total;
    }
}
