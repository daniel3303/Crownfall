using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;

namespace Crownfall.Sim.Systems;

/// <summary>
/// Hero items, bought and sold while the living hero stands near one of its owner's completed town centers. Items live
/// on the hero state, so they outlast death; each kind is carried at most once.
/// </summary>
public sealed class ShopSystem
{
    private readonly Game _game;

    public ShopSystem(Game game)
    {
        _game = game;
    }

    public void Buy(Player player, string itemId)
    {
        if (!_game.Content.TryGetItem(itemId, out var item))
        {
            return;
        }
        var state = player.HeroState;
        var refusal = Refusal(player) ?? BuyRefusal(state, item);
        if (refusal != null)
        {
            _game.Notify(player, refusal, NoticeTone.Warning, null);
            return;
        }
        if (!player.Stock.TrySpend(item.CostAmounts))
        {
            _game.Notify(player, $"Not enough {player.Stock.DescribeShortfall(item.CostAmounts)} for {item.Name}.", NoticeTone.Warning, null);
            return;
        }
        state.Items[Array.IndexOf(state.Items, null)] = item;
        var hero = player.Hero;
        hero.MaxHp += item.Hp;
        hero.Hp += item.Hp;
        _game.Notify(player, $"Bought {item.Name}.", NoticeTone.Success, null);
    }

    public void Sell(Player player, int slot)
    {
        var items = player.HeroState.Items;
        if (slot < 0 || slot >= items.Length || items[slot] == null)
        {
            return;
        }
        var refusal = Refusal(player);
        if (refusal != null)
        {
            _game.Notify(player, refusal, NoticeTone.Warning, null);
            return;
        }
        var item = items[slot];
        items[slot] = null;
        var refund = SellPrice(item);
        player.Stock.Add(refund);
        var hero = player.Hero;
        // Buying added the item's hp to current health too; taking it back keeps a buy-and-sell from healing the hero.
        hero.MaxHp -= item.Hp;
        hero.Hp = Math.Clamp(hero.Hp - item.Hp, 1, hero.MaxHp);
        _game.Notify(player, $"Sold {item.Name} for {Describe(refund)}.", NoticeTone.Success, null);
    }

    /// <summary>What selling an item refunds: the rules' share of each resource it cost, rounded down.</summary>
    public int[] SellPrice(ItemDef item)
    {
        var refund = new int[Resources.Count];
        for (var i = 0; i < Resources.Count; i++)
        {
            refund[i] = (int)MathF.Floor(item.CostAmounts[i] * _game.Content.Rules.ItemSellRefund);
        }
        return refund;
    }

    /// <summary>Why the player cannot trade items right now, or null when its hero stands at a shop.</summary>
    public string Refusal(Player player)
    {
        if (player.Hero is not { IsAlive: true })
        {
            return "Your hero must be alive to trade items.";
        }
        return ShopSite(player) == null ? "Bring your hero near one of your town centers to trade items." : null;
    }

    /// <summary>A completed own town center within the rules' range of the living hero, or null.</summary>
    public Building ShopSite(Player player)
    {
        if (player.Hero is not { IsAlive: true } hero)
        {
            return null;
        }
        var range = _game.Content.Rules.ItemShopRange;
        return _game.Entities.Buildings.FirstOrDefault(b =>
            b.Owner == player && b.IsAlive && b.IsComplete && b.Def.IsTownCenter && b.EdgeDistance(hero.Position) <= range);
    }

    private static string BuyRefusal(HeroState state, ItemDef item)
    {
        if (state.Holds(item))
        {
            return $"Your hero already carries {item.Name}.";
        }
        return state.HasFreeSlot ? null : "Your hero's inventory is full. Sell an item first.";
    }

    private static string Describe(int[] amounts)
    {
        var parts = Resources.All.Where(r => amounts[(int)r] > 0).Select(r => $"{amounts[(int)r]} {Resources.Name(r)}").ToList();
        return parts.Count == 0 ? "nothing" : string.Join(", ", parts);
    }
}
