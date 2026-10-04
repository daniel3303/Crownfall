using System.Numerics;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;

namespace Crownfall.Sim.Systems;

/// <summary>
/// Hero XP, levels and stat points, regeneration, kill bounties with first blood, streaks and shutdowns, and paid revival
/// at a town center after a cooldown.
/// </summary>
public sealed class HeroSystem
{
    private const float SpawnClearance = 0.8f;

    private readonly Game _game;

    public HeroSystem(Game game)
    {
        _game = game;
    }

    /// <summary>True once any hero has been slain by an enemy; the first such kill pays the first-blood bonus.</summary>
    public bool FirstBloodTaken { get; private set; }

    public void Update()
    {
        foreach (var player in _game.Players)
        {
            if (player.IsDefeated)
            {
                continue;
            }
            if (player.Hero is { IsAlive: true } hero)
            {
                Regenerate(hero);
            }
            else if (player.HeroState.ReviveTick == _game.Tick)
            {
                AnnounceRevive(player);
            }
        }
    }

    public Unit SpawnHero(Player player, Vector2 position)
    {
        var hero = _game.SpawnUnit(player.HeroState.Def, player, position);
        player.Hero = hero;
        player.HeroState.ReviveTick = -1;
        return hero;
    }

    /// <summary>
    /// Settles a hero's death: an enemy killer earns the bounty and grows its own streak, then the fallen hero's streak
    /// ends and its revive cooldown starts. The bounty reads the streak before it is reset.
    /// </summary>
    public void OnHeroSlain(Unit hero, Player killer)
    {
        var player = hero.Owner;
        var state = player.HeroState;
        if (killer != null && killer.Team != hero.Team)
        {
            killer.HeroState.KillStreak++;
            AwardKillGold(hero, killer, state.KillStreak);
            AnnounceStreak(killer, hero.Position);
        }
        state.KillStreak = 0;
        player.Hero = null;
        var seconds = ReviveCooldownSeconds(state.Level);
        state.ReviveTick = _game.Tick + (int)(seconds * _game.Content.Rules.TickRate);
        _game.Notify(player, $"Your hero has fallen. Revive it at a town center in {seconds:0}s.", NoticeTone.Alert, hero.Position);
    }

    /// <summary>Gold a slain hero pays its killer; it grows with the hero's level.</summary>
    public int KillGold(int level)
    {
        var rules = _game.Content.Rules;
        return rules.HeroKillGold + rules.HeroKillGoldPerLevel * Math.Max(0, level - 1);
    }

    /// <summary>Extra gold for ending a streak this long; nothing below the rules' shutdown streak.</summary>
    public int ShutdownGold(int streak)
    {
        var rules = _game.Content.Rules;
        return streak < rules.HeroShutdownStreak || rules.HeroShutdownStreak <= 0
            ? 0
            : rules.HeroShutdownGold + rules.HeroShutdownGoldPerKill * (streak - rules.HeroShutdownStreak);
    }

    /// <summary>The announced title for reaching a streak, or null between tiers; the top tier repeats past its count.</summary>
    public string StreakTitle(int streak)
    {
        var tiers = _game.Content.Rules.KillStreaks;
        if (tiers.Count > 0 && streak > tiers[^1].Kills)
        {
            return tiers[^1].Title;
        }
        return tiers.FirstOrDefault(t => t.Kills == streak)?.Title;
    }

    /// <summary>
    /// Pays the killer the level bounty plus any first-blood and shutdown bonus, shown where the hero fell, and
    /// announces the bonuses to everyone.
    /// </summary>
    private void AwardKillGold(Unit hero, Player killer, int victimStreak)
    {
        var rules = _game.Content.Rules;
        var firstBlood = !FirstBloodTaken;
        FirstBloodTaken = true;
        var shutdown = ShutdownGold(victimStreak);
        var bonuses = new List<string>();
        var gold = KillGold(hero.Hero.Level);
        if (firstBlood && rules.FirstBloodGold > 0)
        {
            gold += rules.FirstBloodGold;
            bonuses.Add($"first blood +{rules.FirstBloodGold}");
        }
        if (shutdown > 0)
        {
            gold += shutdown;
            bonuses.Add($"shutdown +{shutdown}");
        }
        _game.Storage.Store(killer, ResourceType.Gold, gold);
        _game.Events.Add(new DepositEvent { Player = killer.Index, X = hero.Position.X, Y = hero.Position.Y, Resource = ResourceType.Gold, Amount = gold });
        var detail = bonuses.Count > 0 ? $" ({string.Join(", ", bonuses)})" : "";
        _game.Notify(killer, $"Enemy hero slain: +{gold} gold{detail}.", NoticeTone.Success, hero.Position);
        if (firstBlood)
        {
            Announce(AnnouncementType.FirstBlood, "First Blood", $"{killer.Name} drew first blood against {hero.Owner.Name}.", killer, hero.Position);
        }
        if (shutdown > 0)
        {
            var ended = _game.Content.Rules.KillStreaks.LastOrDefault(t => t.Kills <= victimStreak)?.Title ?? "streak";
            Announce(AnnouncementType.Shutdown, "Shutdown", $"{killer.Name} ended {hero.Owner.Name}'s {ended}.", killer, hero.Position);
        }
    }

    private void AnnounceStreak(Player killer, Vector2 at)
    {
        var streak = killer.HeroState.KillStreak;
        var title = StreakTitle(streak);
        if (title != null)
        {
            Announce(AnnouncementType.KillStreak, title, $"{killer.Name} has slain {streak} heroes without dying.", killer, at);
        }
    }

    private void Announce(AnnouncementType type, string title, string text, Player player, Vector2 at)
    {
        _game.Events.Add(new AnnouncementEvent { Type = type, Title = title, Text = text, Player = player.Index, Team = player.Team, X = at.X, Y = at.Y });
    }

    public float ReviveCooldownSeconds(int level)
    {
        var rules = _game.Content.Rules;
        return rules.HeroRespawnSeconds + rules.HeroRespawnPerLevel * level;
    }

    /// <summary>True once a fallen hero's cooldown has run out; it then waits for the player to pay.</summary>
    public bool CanRevive(Player player)
    {
        var state = player.HeroState;
        return !player.IsDefeated && player.Hero == null && state.ReviveTick >= 0 && _game.Tick >= state.ReviveTick;
    }

    /// <summary>Pays the revive price and brings the hero back beside a completed own town center, at once.</summary>
    public void Revive(Player player, int buildingId)
    {
        if (player.Hero != null)
        {
            return;
        }
        if (!CanRevive(player))
        {
            _game.Notify(player, "Your hero is not ready to be revived yet.", NoticeTone.Warning, null);
            return;
        }
        var townCenter = ReviveSite(player, buildingId);
        if (townCenter == null)
        {
            _game.Notify(player, "You need a completed town center to revive your hero.", NoticeTone.Warning, null);
            return;
        }
        var cost = ReviveCost(player);
        if (!player.Stock.TrySpend(cost))
        {
            _game.Notify(player, $"Not enough {player.Stock.DescribeShortfall(cost)} to revive your hero.", NoticeTone.Warning, null);
            return;
        }
        var hero = SpawnHero(player, SpawnPointBeside(townCenter));
        _game.Notify(player, "Your hero has returned!", NoticeTone.Success, hero.Position);
    }

    /// <summary>
    /// What reviving the player's hero costs now: the level's price with each resource capped at the player's storage,
    /// since the price grows without limit and a price above the cap could never be paid.
    /// </summary>
    public int[] ReviveCost(Player player)
    {
        var cost = _game.Content.HeroReviveCost(player.HeroState.Level);
        for (var i = 0; i < cost.Length; i++)
        {
            cost[i] = Math.Min(cost[i], player.Stock.Cap((Core.ResourceType)i));
        }
        return cost;
    }

    /// <summary>The town center a revive uses: the requested one, or the player's oldest completed one when 0.</summary>
    public Building ReviveSite(Player player, int buildingId)
    {
        if (buildingId != 0)
        {
            return _game.Entities.Get(buildingId) is Building { IsComplete: true } chosen && chosen.Owner == player && chosen.Def.IsTownCenter
                ? chosen
                : null;
        }
        return _game.Entities.Buildings.FirstOrDefault(b => b.Owner == player && b.IsAlive && b.IsComplete && b.Def.IsTownCenter);
    }

    /// <summary>
    /// Shares a kill's experience among the killing team's living heroes near the death: a slain hero pays by its
    /// level with each earner's level gap applied, anything else pays its bounty. Kills without a killer pay nothing.
    /// </summary>
    public void AwardKillXp(Entity victim, Player killer)
    {
        if (killer == null || killer.Team == victim.Team)
        {
            return;
        }
        var rules = _game.Content.Rules;
        var earners = _game.Players
            .Where(p => p.Team == killer.Team && p.Hero is { IsAlive: true } && Vector2.Distance(p.Hero.Position, victim.Position) <= rules.HeroXpRadius)
            .ToList();
        if (earners.Count == 0)
        {
            return;
        }
        if (victim is Unit { Hero: not null } hero)
        {
            var share = HeroExperience.HeroKillShare(rules, hero.Hero.Level, earners.Count);
            var victimLevel = HeroExperience.DecimalLevel(rules, hero.Hero);
            foreach (var earner in earners)
            {
                var modifier = HeroExperience.LevelModifier(rules, victimLevel, HeroExperience.DecimalLevel(rules, earner.HeroState));
                AddXp(earner, (int)MathF.Round(share * modifier));
            }
            return;
        }
        var bounty = victim switch
        {
            Unit unit => unit.Def.Xp,
            Building => rules.BuildingXp,
            _ => 0,
        };
        var each = (int)MathF.Round(HeroExperience.BountyShare(rules, bounty, earners.Count));
        foreach (var earner in earners)
        {
            AddXp(earner, each);
        }
    }

    /// <summary>Each level gained grows the hero more than the last and grants one stat point; there is no level cap.</summary>
    public void AddXp(Player player, int xp)
    {
        if (xp <= 0)
        {
            return;
        }
        var state = player.HeroState;
        var rules = _game.Content.Rules;
        state.Xp += xp;
        while (state.Xp >= rules.HeroXpForLevel(state.Level + 1))
        {
            state.Level++;
            state.UnspentPoints++;
            var hero = player.Hero;
            if (hero == null)
            {
                continue;
            }
            Grow(hero, state.LevelUpHp);
            _game.Events.Add(new LevelUpEvent
            {
                Player = player.Index,
                Team = player.Team,
                Hero = hero.Id,
                Level = state.Level,
                X = hero.Position.X,
                Y = hero.Position.Y,
            });
        }
    }

    /// <summary>Spends one banked point on a stat. Ranks live on the hero state, so they outlast death.</summary>
    public void LearnStat(Player player, string statId)
    {
        var state = player.HeroState;
        var index = _game.Content.HeroStatIndex(statId);
        if (index < 0 || state.UnspentPoints <= 0)
        {
            return;
        }
        state.UnspentPoints--;
        state.Ranks[index]++;
        var stat = _game.Content.HeroStats[index];
        if (stat.Effect == Content.HeroStatEffect.MaxHealth && player.Hero is { IsAlive: true } hero)
        {
            Grow(hero, stat.PerRank);
        }
    }

    /// <summary>
    /// Fills a talent tier the hero's level has opened with one of its options. Talents live on the hero state, so
    /// they outlast death, and one that adds health grows a living hero at once.
    /// </summary>
    public void PickTalent(Player player, int tier, string talentId)
    {
        var state = player.HeroState;
        if (tier < 0 || tier >= state.Talents.Length || state.Talents[tier] != null)
        {
            return;
        }
        if (state.Level < state.TalentLevels[tier])
        {
            _game.Notify(player, $"These talents open at hero level {state.TalentLevels[tier]}.", NoticeTone.Warning, null);
            return;
        }
        var talent = state.Def.Talents[tier].FirstOrDefault(t => t.Id == talentId);
        if (talent == null)
        {
            return;
        }
        state.Talents[tier] = talent;
        if (talent.Hp > 0 && player.Hero is { IsAlive: true } hero)
        {
            Grow(hero, talent.Hp);
        }
    }

    /// <summary>
    /// Puts another of the race's heroes in place of one that has earned nothing yet, as when a player takes over a bot
    /// seat at the start of a match; the new hero stands where the old one stood. Returns false when refused.
    /// </summary>
    public bool TryChangeHero(Player player, Content.UnitDef def)
    {
        var state = player.HeroState;
        if (def == state.Def || !player.Race.HeroUnits.Contains(def) || !state.IsFresh)
        {
            return false;
        }
        var old = player.Hero;
        player.HeroState = MatchSetup.NewHeroState(_game.Content, def);
        player.HeroState.ReviveTick = state.ReviveTick;
        if (old == null)
        {
            return true;
        }
        var standing = old.IsAlive;
        player.Hero = null;
        _game.Entities.MarkRemoved(old);
        if (standing)
        {
            var hero = SpawnHero(player, old.Position);
            hero.Facing = old.Facing;
        }
        return true;
    }

    private static void Grow(Unit hero, float hp)
    {
        hero.MaxHp += hp;
        hero.Hp += hp;
    }

    /// <summary>Items heal the hero at all times; once left unhurt for the rule's delay it also heals a share of its max hp.</summary>
    private void Regenerate(Unit hero)
    {
        if (hero.Hp >= hero.MaxHp)
        {
            return;
        }
        var perSecond = hero.Hero.ItemRegen + (IsResting(hero) ? RegenPerSecond(hero) : 0);
        hero.Hp = MathF.Min(hero.MaxHp, hero.Hp + perSecond * _game.Dt);
    }

    public bool IsResting(Unit hero)
    {
        var rules = _game.Content.Rules;
        return _game.Tick - hero.LastDamagedTick >= (int)(rules.HeroRegenDelaySeconds * rules.TickRate);
    }

    public float RegenPerSecond(Unit hero)
    {
        return hero.MaxHp * _game.Content.Rules.HeroRegenPerSecond;
    }

    private void AnnounceRevive(Player player)
    {
        var cost = ReviveCost(player);
        var price = string.Join(", ", Core.Resources.All.Where(r => cost[(int)r] > 0).Select(r => $"{cost[(int)r]} {Core.Resources.Name(r)}"));
        _game.Notify(player, $"Your hero can be revived at a town center for {price}.", NoticeTone.Success, null);
    }

    private Vector2 SpawnPointBeside(Building townCenter)
    {
        var position = townCenter.Rect.Center + new Vector2(0, townCenter.Def.Size / 2f + SpawnClearance);
        var tileX = (int)position.X;
        var tileY = (int)position.Y;
        var pathfinder = _game.Pathfinder;
        if ((!_game.Map.IsWalkable(position) || _game.Map.IsShallow(tileX, tileY))
            && (pathfinder.TryNearestWalkable(tileX, tileY, out var x, out var y, dry: true) || pathfinder.TryNearestWalkable(tileX, tileY, out x, out y)))
        {
            position = new Vector2(x + 0.5f, y + 0.5f);
        }
        return position;
    }
}
