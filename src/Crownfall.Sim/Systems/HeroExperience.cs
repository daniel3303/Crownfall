using Crownfall.Sim.Content;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Systems;

/// <summary>
/// League of Legends kill-experience rules (wiki.leagueoflegends.com "Experience (champion)", patch 13.4 values), rescaled
/// so a kill is the same share of a level-up as in League. Hero kills pay by the victim's level, split among the
/// sharing heroes and adjusted by each earner's level gap; other kills pay their bounty, 130% split when shared.
/// </summary>
public static class HeroExperience
{
    /// <summary>What a slain hero of this level pays one hero alone.</summary>
    public static float SoloKillXp(RulesDef rules, int victimLevel)
    {
        var table = rules.HeroKillXp;
        if (victimLevel <= table.Count)
        {
            return table[Math.Max(0, victimLevel - 1)];
        }
        return table[^1] + rules.HeroKillXpPerLevel * (victimLevel - table.Count);
    }

    /// <summary>Each earner's base share of a hero kill before its level-gap modifier.</summary>
    public static float HeroKillShare(RulesDef rules, int victimLevel, int earners)
    {
        var solo = SoloKillXp(rules, victimLevel);
        if (earners <= 1)
        {
            return solo;
        }
        var shares = rules.HeroSharedKillXpShare;
        var share = shares.Count == 0 ? 1f : shares[Math.Clamp(victimLevel - 1, 0, shares.Count - 1)];
        return solo * share / earners;
    }

    /// <summary>
    /// Multiplier for an earner: none within one decimal level of the victim, then each further level adds or removes
    /// <see cref="RulesDef.HeroKillXpLevelStep"/>, capped by the max bonus and max penalty.
    /// </summary>
    public static float LevelModifier(RulesDef rules, float victimLevel, float earnerLevel)
    {
        var gap = victimLevel - earnerLevel;
        var beyond = MathF.Max(0, MathF.Abs(gap) - 1) * rules.HeroKillXpLevelStep;
        return gap > 0 ? 1 + MathF.Min(beyond, rules.HeroKillXpMaxBonus) : 1 - MathF.Min(beyond, rules.HeroKillXpMaxPenalty);
    }

    /// <summary>Each earner's share of a unit, creep or building bounty: all of it alone, an equal split of 130% when shared.</summary>
    public static float BountyShare(RulesDef rules, int bounty, int earners)
    {
        return earners <= 1 ? bounty : bounty * rules.SharedXpTotal / earners;
    }

    /// <summary>Level plus progress toward the next one, like League's decimal level.</summary>
    public static float DecimalLevel(RulesDef rules, HeroState state)
    {
        var start = rules.HeroXpForLevel(state.Level);
        var span = Math.Max(1, rules.HeroXpForLevel(state.Level + 1) - start);
        return state.Level + Math.Clamp((state.Xp - start) / (float)span, 0, 0.999f);
    }
}
