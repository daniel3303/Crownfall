using Crownfall.Sim.Content;

namespace Crownfall.Sim.Entities;

/// <summary>Hero progress that survives the hero's death: level, XP, stat ranks, unspent points and ability cooldowns.</summary>
public sealed class HeroState
{
    public HeroState(UnitDef def, int abilityCount, IReadOnlyList<HeroStatDef> stats)
    {
        Def = def;
        Cooldowns = new float[abilityCount];
        Stats = stats;
        Ranks = new int[stats.Count];
    }

    public UnitDef Def { get; }
    public int Level { get; set; } = 1;
    public int Xp { get; set; }
    public float[] Cooldowns { get; }
    public IReadOnlyList<HeroStatDef> Stats { get; }

    /// <summary>Points spent per stat, in content order.</summary>
    public int[] Ranks { get; }

    /// <summary>Level-up points not yet spent; they bank until the player picks a stat.</summary>
    public int UnspentPoints { get; set; }

    /// <summary>Tick at which a fallen hero may be revived; -1 while alive.</summary>
    public int ReviveTick { get; set; } = -1;

    public float BonusHp => LevelGrowth(Def.Growth?.Hp ?? 0, Level) + StatBonus(HeroStatEffect.MaxHealth);
    public float BonusAttack => LevelGrowth(Def.Growth?.Attack ?? 0, Level) + StatBonus(HeroStatEffect.AttackDamage);

    /// <summary>Max hp the latest level added; it rises with every level.</summary>
    public float LevelUpHp => LevelGrowth(Def.Growth?.Hp ?? 0, Level) - LevelGrowth(Def.Growth?.Hp ?? 0, Level - 1);
    public float AttackSpeedBonus => StatBonus(HeroStatEffect.AttackSpeed);
    public float MoveSpeedBonus => StatBonus(HeroStatEffect.MoveSpeed);
    public float LifeSteal => StatBonus(HeroStatEffect.LifeSteal);

    private float LevelGrowth(float perLevel, int level) => Def.Growth?.Total(perLevel, level) ?? 0;

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
}
