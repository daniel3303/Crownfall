using Crownfall.Server.Protocol.Messages;
using Crownfall.Sim;
using Crownfall.Sim.Content;
using Crownfall.Sim.Entities;

namespace Crownfall.Server.Matches;

/// <summary>Builds the viewer's <see cref="HeroView"/>; a fallen hero reports the stats, items included, it will return with.</summary>
internal static class HeroViewFactory
{
    public static HeroView Create(Game game, Player viewer)
    {
        var state = viewer.HeroState;
        var rules = game.Content.Rules;
        var hero = viewer.Hero is { IsAlive: true } alive ? alive : null;
        var reviveTicks = hero == null && state.ReviveTick >= 0 ? state.ReviveTick - game.Tick : 0;
        return new HeroView
        {
            Id = hero?.Id ?? 0,
            Unit = state.Def.Id,
            Level = state.Level,
            Xp = state.Xp,
            XpLevelStart = rules.HeroXpForLevel(state.Level),
            XpNextLevel = rules.HeroXpForLevel(state.Level + 1),
            Cooldowns = (float[])state.Cooldowns.Clone(),
            UnspentPoints = state.UnspentPoints,
            Ranks = (int[])state.Ranks.Clone(),
            ReviveSeconds = MathF.Max(0, reviveTicks / (float)rules.TickRate),
            CanRevive = game.Heroes.CanRevive(viewer) && game.Heroes.ReviveSite(viewer, 0) != null,
            ReviveCost = game.Heroes.ReviveCost(viewer),
            Items = state.Items.Select(i => i?.Id).ToArray(),
            CanShop = game.Shop.Refusal(viewer) == null,
            Streak = state.KillStreak,
            CooldownFactor = rules.HeroCooldownFactor(state.Level, state.ItemCooldownReduction),
            Stats = hero == null ? Resting(state) : Live(game, hero),
        };
    }

    private static HeroStatsView Live(Game game, Unit hero)
    {
        var regen = hero.Hero.ItemRegen + (game.Heroes.IsResting(hero) ? game.Heroes.RegenPerSecond(hero) : 0);
        return new HeroStatsView
        {
            Hp = hero.Hp,
            MaxHp = hero.MaxHp,
            Attack = hero.AttackDamage,
            Cooldown = hero.CooldownAt(game.Tick),
            Range = hero.Def.Range,
            Speed = hero.SpeedAt(game.Tick),
            ArmorMelee = hero.ArmorAgainst(DamageType.Melee),
            ArmorPierce = hero.ArmorAgainst(DamageType.Pierce),
            LifeSteal = hero.Hero.LifeSteal,
            Sight = hero.Sight,
            Regen = regen,
            Regenerating = hero.Hp < hero.MaxHp && regen > 0,
        };
    }

    private static HeroStatsView Resting(HeroState state)
    {
        var def = state.Def;
        return new HeroStatsView
        {
            Hp = 0,
            MaxHp = def.Hp + state.BonusHp,
            Attack = def.Attack + state.BonusAttack,
            Cooldown = def.Cooldown / (1 + state.AttackSpeedBonus),
            Range = def.Range,
            Speed = def.Speed * (1 + state.MoveSpeedBonus),
            ArmorMelee = def.Armor.Melee + state.ArmorBonus(DamageType.Melee),
            ArmorPierce = def.Armor.Pierce + state.ArmorBonus(DamageType.Pierce),
            LifeSteal = state.LifeSteal,
            Sight = def.Sight,
            Regen = 0,
            Regenerating = false,
        };
    }
}
