using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Systems;

namespace Crownfall.Sim.Bots;

/// <summary>Combat math derived from content: damage rates between unit types, fighting power and counter value.</summary>
public sealed class BotCombatModel
{
    // Every ranged unit in a group can fire while melee units queue for frontage, so ranged damage counts extra against melee.
    private const float RangedFrontageBonus = 1.5f;

    // Hp a defensive building's fire is weighed against, so towers and town centers compare with units.
    private const float ReferenceHp = 70f;

    private const float MinExchange = 0.05f;
    private const float MaxExchange = 20f;

    // Enemies an area ability is expected to catch when a bot sizes up a hero; soldiers crowd a hero in melee, so it is high.
    private const float AbilityTargets = 6f;

    // Only a few soldiers reach a hero at once while its area abilities hit all of them, so summed power undersells it.
    private const float HeroCrowdFactor = 2f;

    // Units a splashing blow is expected to land on, per tile of splash radius beyond its target.
    private const float SplashCrowd = 1.5f;

    // Melee units that can stand around a big target and hit it at once.
    private const int MeleeFrontage = 12;

    private readonly IReadOnlyList<AbilityDef> _abilities;
    private readonly RulesDef _rules;
    private readonly float[,] _dps;
    private readonly float[,] _exchange;
    private readonly float _averagePower;
    private readonly float _averageCost;
    private readonly float _averageHp;

    public BotCombatModel(ContentDb content)
    {
        var units = content.Units;
        _abilities = content.Abilities;
        _rules = content.Rules;
        Military = units.Where(u => u.IsMilitary).ToList();
        Fighters = units.Where(u => u.IsMilitary || u.IsHero).ToList();
        _dps = new float[units.Count, units.Count];
        foreach (var attacker in units)
        {
            foreach (var target in units)
            {
                var damage = CombatSystem.ComputeDamage(attacker.Attack, attacker.DamageType, attacker.Bonus, target);
                _dps[attacker.Kind, target.Kind] = attacker.Cooldown > 0 ? damage / attacker.Cooldown : 0;
            }
        }
        _averagePower = Military.Count == 0 ? 1 : Military.Average(Power);
        _averageCost = Military.Count == 0 ? 1 : Military.Average(Cost);
        _averageHp = Military.Count == 0 ? 1 : Military.Average(u => u.Hp);
        _exchange = new float[units.Count, units.Count];
        foreach (var mine in Military)
        {
            foreach (var theirs in Fighters)
            {
                _exchange[mine.Kind, theirs.Kind] = ComputeExchange(mine, theirs);
            }
        }
    }

    /// <summary>Trainable fighting units in content order.</summary>
    public IReadOnlyList<UnitDef> Military { get; }

    /// <summary>Everything an enemy fights with: the trainable units and the heroes.</summary>
    public IReadOnlyList<UnitDef> Fighters { get; }

    /// <summary>How many average soldiers a fighter is worth; a hero counts as several.</summary>
    public float Weight(UnitDef def)
    {
        return def.IsHero ? Power(def) / _averagePower : 1f;
    }

    public float Dps(UnitDef attacker, UnitDef target)
    {
        return _dps[attacker.Kind, target.Kind];
    }

    /// <summary>
    /// Resource-for-resource trade of <paramref name="mine"/> against <paramref name="theirs"/>: damage dealt times hp over
    /// damage taken times their hp, scaled by cost. Above 1 means mine wins the trade.
    /// </summary>
    public float Exchange(UnitDef mine, UnitDef theirs)
    {
        return _exchange[mine.Kind, theirs.Kind];
    }

    /// <summary>
    /// Fighting power of a live unit: the geometric mean of its hp and its damage rate against the military roster. A hero
    /// adds its unlocked area abilities at its shown level.
    /// </summary>
    public float Power(Unit unit)
    {
        return Crowd(unit.Def) * MathF.Sqrt(MathF.Max(0, unit.Hp) * ThreatDps(unit));
    }

    /// <summary>
    /// Power in the fight at hand, where a hero's area abilities count only by the share of a soldier they kill: blasts
    /// that merely chip a wave do not stop it, so a young hero alone is no reason to flee.
    /// </summary>
    public float LocalPower(Unit unit)
    {
        if (!unit.IsHero)
        {
            return Power(unit);
        }
        var level = HeroLevel(unit);
        var dps = AverageDps(unit.AttackDamage, unit.Def) + AbilityDps(level, lethalOnly: true);
        var crowd = 1 + (HeroCrowdFactor - 1) * AreaLethality(level);
        return crowd * MathF.Sqrt(MathF.Max(0, unit.Hp) * dps);
    }

    public float FullPower(Unit unit)
    {
        return Crowd(unit.Def) * MathF.Sqrt(unit.MaxHp * ThreatDps(unit));
    }

    /// <summary>Damage per second the unit deals to an average soldier, abilities included for heroes and splash for bosses.</summary>
    public float ThreatDps(Unit unit)
    {
        var dps = AverageDps(unit.AttackDamage, unit.Def) * SplashTargets(unit.Def);
        return unit.IsHero ? dps + AbilityDps(HeroLevel(unit), lethalOnly: false) : dps;
    }

    /// <summary>Power of a unit type at full health and first level, for units the bot has not seen.</summary>
    public float Power(UnitDef def)
    {
        var dps = AverageDps(def.Attack, def) * SplashTargets(def) + (def.IsHero ? AbilityDps(1, lethalOnly: false) : 0);
        return Crowd(def) * MathF.Sqrt(def.Hp * dps);
    }

    /// <summary>
    /// How much of a soldier an area blow is worth: one that kills an average soldier outright counts in full, one that
    /// only chips soldiers counts by the share of their health it takes, since they keep fighting.
    /// </summary>
    public float Lethality(float damage)
    {
        return Math.Clamp(damage / _averageHp, 0f, 1f);
    }

    /// <summary>The most lethal area ability a hero of this level has unlocked, as <see cref="Lethality"/>.</summary>
    public float AreaLethality(int level)
    {
        var best = 0f;
        foreach (var ability in _abilities)
        {
            if (level >= ability.UnlockLevel && ability.Damage > 0 && ability.Radius > 0)
            {
                best = MathF.Max(best, Lethality(ability.DamageAt(level)));
            }
        }
        return best;
    }

    /// <summary>
    /// Soldiers a group is expected to lose bringing down a boss: the boss's damage over the time the group needs to kill
    /// it, each blow landing on its splash crowd, in average soldiers. Melee hitters count only up to the frontage.
    /// </summary>
    public float SlayLosses(IReadOnlyList<Unit> group, UnitDef boss, float bossHp, int tick)
    {
        var melee = 0;
        var dps = 0f;
        foreach (var unit in group)
        {
            if (!unit.Def.IsRanged && !unit.IsHero && ++melee > MeleeFrontage)
            {
                continue;
            }
            var hit = CombatSystem.ComputeDamage(unit.AttackDamage, unit.Def.DamageType, unit.Def.Bonus, boss);
            dps += unit.Def.Cooldown > 0 ? hit / unit.CooldownAt(tick) : 0;
            dps += unit.IsHero ? SingleTargetAbilityDps(HeroLevel(unit)) : 0;
        }
        if (dps <= 0 || group.Count == 0)
        {
            return float.MaxValue;
        }
        var seconds = bossHp / dps;
        var blow = group.Average(u => CombatSystem.ComputeDamage(boss.Attack, boss.DamageType, boss.Bonus, u));
        var hpEach = group.Average(u => u.Hp);
        return blow * SplashTargets(boss) / boss.Cooldown * seconds / MathF.Max(1, hpEach);
    }

    private static float Crowd(UnitDef def)
    {
        return def.IsHero ? HeroCrowdFactor : 1f;
    }

    private static float SplashTargets(UnitDef def)
    {
        return 1 + SplashCrowd * def.Splash;
    }

    /// <summary>Threat a defensive building adds to a fight; zero for buildings without an attack.</summary>
    public float DefensePower(BuildingDef def)
    {
        var attack = def.Attack;
        if (attack == null || attack.Cooldown <= 0 || Military.Count == 0)
        {
            return 0;
        }
        var total = 0f;
        foreach (var target in Military)
        {
            total += CombatSystem.ComputeDamage(attack.Damage, attack.DamageType, [], target) / attack.Cooldown;
        }
        return MathF.Sqrt(ReferenceHp * total / Military.Count);
    }

    /// <summary>Damage one attack of the unit deals to a live target, with any armor a hero's items add.</summary>
    public static float HitDamage(Unit attacker, Unit target)
    {
        return CombatSystem.ComputeDamage(attacker.AttackDamage, attacker.Def.DamageType, attacker.Def.Bonus, target);
    }

    public static float Cost(UnitDef def)
    {
        return MathF.Max(1, Resources.Total(def.CostAmounts));
    }

    /// <summary>Area damage per second a hero's abilities deal to a crowd; <paramref name="lethalOnly"/> weighs it by <see cref="Lethality"/>.</summary>
    private float AbilityDps(int level, bool lethalOnly)
    {
        var total = 0f;
        foreach (var ability in _abilities)
        {
            if (level >= ability.UnlockLevel && ability.Cooldown > 0 && ability.Damage > 0)
            {
                var damage = ability.DamageAt(level);
                var share = lethalOnly ? Lethality(damage) : 1f;
                total += damage * AbilityTargets * share / (ability.Cooldown * _rules.HeroCooldownFactor(level));
            }
        }
        return total;
    }

    /// <summary>What a hero's damaging abilities add against one big target.</summary>
    private float SingleTargetAbilityDps(int level)
    {
        var total = 0f;
        foreach (var ability in _abilities)
        {
            if (level >= ability.UnlockLevel && ability.Cooldown > 0 && ability.Damage > 0)
            {
                total += ability.DamageAt(level) / (ability.Cooldown * _rules.HeroCooldownFactor(level));
            }
        }
        return total;
    }

    /// <summary>The level every snapshot shows above a hero; max hp no longer tells it once health ranks are bought.</summary>
    private static int HeroLevel(Unit hero)
    {
        return hero.Hero?.Level ?? 1;
    }

    private float AverageDps(float attack, UnitDef def)
    {
        if (def.Cooldown <= 0 || Military.Count == 0)
        {
            return 0;
        }
        var total = 0f;
        foreach (var target in Military)
        {
            total += CombatSystem.ComputeDamage(attack, def.DamageType, def.Bonus, target);
        }
        return total / Military.Count / def.Cooldown;
    }

    private float ComputeExchange(UnitDef mine, UnitDef theirs)
    {
        var dealt = EffectiveDps(mine, theirs) * mine.Hp;
        var taken = EffectiveDps(theirs, mine) * theirs.Hp;
        if (taken <= 0)
        {
            return MaxExchange;
        }
        return Math.Clamp(dealt / taken * Value(theirs) / Value(mine), MinExchange, MaxExchange);
    }

    /// <summary>Resources a fighter is worth; heroes cost nothing, so they are valued as the soldiers their power equals.</summary>
    private float Value(UnitDef def)
    {
        return def.IsHero ? _averageCost * Weight(def) : Cost(def);
    }

    private float EffectiveDps(UnitDef attacker, UnitDef target)
    {
        var bonus = attacker.IsRanged && !target.IsRanged ? RangedFrontageBonus : 1f;
        return Dps(attacker, target) * bonus;
    }
}
