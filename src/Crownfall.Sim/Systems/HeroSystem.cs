using System.Numerics;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;

namespace Crownfall.Sim.Systems;

/// <summary>Hero XP, levels and stat points, resting regeneration, and paid revival at a town center after a cooldown.</summary>
public sealed class HeroSystem
{
    private const float SpawnClearance = 0.8f;

    private readonly Game _game;

    public HeroSystem(Game game)
    {
        _game = game;
    }

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

    public void OnHeroDied(Unit hero)
    {
        var player = hero.Owner;
        var state = player.HeroState;
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

    /// <summary>Pays the enemy who slew a hero its bounty, shown where the hero fell.</summary>
    public void AwardKillGold(Unit hero, Player killer)
    {
        if (killer == null || killer.Team == hero.Team)
        {
            return;
        }
        var gold = KillGold(hero.Hero.Level);
        _game.Storage.Store(killer, ResourceType.Gold, gold);
        _game.Events.Add(new DepositEvent { Player = killer.Index, X = hero.Position.X, Y = hero.Position.Y, Resource = ResourceType.Gold, Amount = gold });
        _game.Notify(killer, $"Enemy hero slain: +{gold} gold.", NoticeTone.Success, hero.Position);
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

    private static void Grow(Unit hero, float hp)
    {
        hero.MaxHp += hp;
        hero.Hp += hp;
    }

    /// <summary>A hero left unhurt for the rule's delay heals a share of its max hp every tick, up to full.</summary>
    private void Regenerate(Unit hero)
    {
        if (hero.Hp >= hero.MaxHp || !IsResting(hero))
        {
            return;
        }
        hero.Hp = MathF.Min(hero.MaxHp, hero.Hp + RegenPerSecond(hero) * _game.Dt);
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
