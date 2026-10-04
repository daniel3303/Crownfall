using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>
/// Spends the bot hero's points by fixed weights, buys a fixed item build within the profile's budget at home and above
/// the reserve, and pays the revive as soon as it is due. The economy holds the revive back from the moment the hero falls.
/// </summary>
public sealed class BotHeroUpgrades
{
    private static readonly Dictionary<HeroStatEffect, float> Weights = new()
    {
        [HeroStatEffect.AttackDamage] = 3f,
        [HeroStatEffect.MaxHealth] = 3f,
        [HeroStatEffect.LifeSteal] = 2f,
        [HeroStatEffect.AttackSpeed] = 2f,
        [HeroStatEffect.MoveSpeed] = 1f,
    };

    // Cheap damage, health and armor first, then sustain, attack speed and heavy armor.
    private static readonly string[] ItemBuild = ["ironSword", "vitalityCharm", "leatherArmor", "vampireFang", "hasteGloves", "plateArmor"];

    // With the build complete, the first item is sold to make room for the second.
    private static readonly (string Sell, string Buy) LateUpgrade = ("ironSword", "warlordBlade");

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotProfile _profile;

    public BotHeroUpgrades(Game game, Player player, BotProfile profile)
    {
        _game = game;
        _player = player;
        _profile = profile;
    }

    /// <summary>True when the next item is affordable but the hero is away from every town center.</summary>
    public bool WantsShop { get; private set; }

    /// <summary>One think; while <paramref name="urgent"/> the army comes first and no item is bought.</summary>
    public void Run(BotView view, int[] reserve, bool urgent)
    {
        if (_player.HeroState.UnspentPoints > 0)
        {
            _game.Commands.Apply(_player, new HeroStatCommand { Stat = NextStat() });
        }
        if (view.TownCenter != null && _game.Heroes.CanRevive(_player) && _player.Stock.CanAfford(_game.Heroes.ReviveCost(_player)))
        {
            _game.Commands.Apply(_player, new ReviveHeroCommand { Building = view.TownCenter.Id });
        }
        BuyItems(reserve, urgent);
    }

    private void BuyItems(int[] reserve, bool urgent)
    {
        var (sell, buy) = NextPurchase();
        WantsShop = false;
        if (urgent || buy == null || _player.Hero is not { IsAlive: true } || !CanAffordAbove(buy, sell, reserve))
        {
            return;
        }
        if (_game.Shop.Refusal(_player) != null)
        {
            WantsShop = true;
            return;
        }
        if (sell >= 0)
        {
            _game.Commands.Apply(_player, new SellItemCommand { Slot = sell });
        }
        _game.Commands.Apply(_player, new BuyItemCommand { Item = buy.Id });
    }

    /// <summary>
    /// The next build item, or the late upgrade with the slot it replaces (-1 sells nothing). The build stops at its first
    /// item beyond the budget, so a cheap bot never skips ahead.
    /// </summary>
    private (int Sell, ItemDef Buy) NextPurchase()
    {
        var state = _player.HeroState;
        foreach (var id in ItemBuild)
        {
            if (_game.Content.TryGetItem(id, out var item) && !state.Holds(item))
            {
                return state.HasFreeSlot && InBudget(item) ? (-1, item) : (-1, null);
            }
        }
        if (_game.Content.TryGetItem(LateUpgrade.Sell, out var old) && _game.Content.TryGetItem(LateUpgrade.Buy, out var upgrade)
            && state.Holds(old) && !state.Holds(upgrade) && InBudget(upgrade))
        {
            return (Array.IndexOf(state.Items, old), upgrade);
        }
        return (-1, null);
    }

    private bool InBudget(ItemDef item)
    {
        return Resources.Total(item.CostAmounts) <= _profile.ItemBudget;
    }

    /// <summary>Whether the stockpile, plus what selling the replaced item refunds, covers the item above the reserve.</summary>
    private bool CanAffordAbove(ItemDef item, int sell, int[] reserve)
    {
        var refund = sell >= 0 ? _game.Shop.SellPrice(_player.HeroState.Items[sell]) : new int[Resources.Count];
        for (var i = 0; i < Resources.Count; i++)
        {
            if (item.CostAmounts[i] > 0 && _player.Stock[(ResourceType)i] + refund[i] < item.CostAmounts[i] + reserve[i])
            {
                return false;
            }
        }
        return true;
    }

    /// <summary>The stat furthest below its weighted share of the ranks; ties go to content order.</summary>
    public string NextStat()
    {
        var stats = _game.Content.HeroStats;
        var ranks = _player.HeroState.Ranks;
        var best = 0;
        var bestScore = float.MaxValue;
        for (var i = 0; i < stats.Count; i++)
        {
            var score = (ranks[i] + 1) / Weights.GetValueOrDefault(stats[i].Effect, 1f);
            if (score < bestScore)
            {
                bestScore = score;
                best = i;
            }
        }
        return stats[best].Id;
    }
}
