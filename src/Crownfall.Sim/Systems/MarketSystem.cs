using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;

namespace Crownfall.Sim.Systems;

/// <summary>
/// Trades food, wood and stone for gold, one lot at a time, at the player's own market buildings. Buying pays the
/// mid price plus half the spread and raises the price; selling earns the mid price minus half the spread and
/// lowers it; prices drift back toward their base every tick. A trade that would overflow storage is refused.
/// </summary>
public sealed class MarketSystem
{
    private readonly Game _game;
    private readonly float[] _basePrices;

    public MarketSystem(Game game)
    {
        _game = game;
        _basePrices = game.Content.MarketBasePrices;
    }

    private Content.MarketDef Market => _game.Content.Rules.Market;

    public static bool IsTradable(float[] basePrices, ResourceType type)
    {
        return type != ResourceType.Gold && basePrices[(int)type] > 0;
    }

    public bool IsTradable(ResourceType type)
    {
        return IsTradable(_basePrices, type);
    }

    public void Update()
    {
        var drift = Market.DriftPerSecond * _game.Dt;
        foreach (var player in _game.Players)
        {
            for (var i = 0; i < Resources.Count; i++)
            {
                var price = player.MarketPrices[i];
                var target = _basePrices[i];
                player.MarketPrices[i] = price < target ? MathF.Min(target, price + drift) : MathF.Max(target, price - drift);
            }
        }
    }

    /// <summary>Gold one lot costs to buy now.</summary>
    public int BuyPrice(Player player, ResourceType type)
    {
        return (int)MathF.Round(player.MarketPrices[(int)type] * (1 + Market.Spread / 2));
    }

    /// <summary>Gold one lot earns when sold now.</summary>
    public int SellPrice(Player player, ResourceType type)
    {
        return (int)MathF.Round(player.MarketPrices[(int)type] * (1 - Market.Spread / 2));
    }

    public void Trade(Player player, int buildingId, ResourceType type, bool buy)
    {
        if (!Enum.IsDefined(type) || !IsTradable(type) || !IsMarketOf(player, buildingId))
        {
            return;
        }
        var refusal = buy ? TryBuy(player, type) : TrySell(player, type);
        if (refusal != null)
        {
            _game.Notify(player, refusal, NoticeTone.Warning, null);
        }
    }

    private bool IsMarketOf(Player player, int buildingId)
    {
        return _game.Entities.Get(buildingId) is Building { IsComplete: true, Def.Market: true } building && building.IsAlive && building.Owner == player;
    }

    private string TryBuy(Player player, ResourceType type)
    {
        var stock = player.Stock;
        var lot = Market.Lot;
        var price = BuyPrice(player, type);
        if (stock.Room(type) < lot)
        {
            return $"No room to store {lot} more {Resources.Name(type)}.";
        }
        if (!stock.TryTake(ResourceType.Gold, price))
        {
            return $"Not enough gold: {lot} {Resources.Name(type)} costs {price}.";
        }
        stock.Store(type, lot);
        Move(player, type, Market.Step);
        return null;
    }

    private string TrySell(Player player, ResourceType type)
    {
        var stock = player.Stock;
        var lot = Market.Lot;
        var price = SellPrice(player, type);
        if (stock.Room(ResourceType.Gold) < price)
        {
            return $"No room to store {price} more gold.";
        }
        if (!stock.TryTake(type, lot))
        {
            return $"Not enough {Resources.Name(type)}: a sale takes {lot}.";
        }
        stock.Store(ResourceType.Gold, price);
        Move(player, type, -Market.Step);
        return null;
    }

    private void Move(Player player, ResourceType type, float delta)
    {
        var i = (int)type;
        player.MarketPrices[i] = Math.Clamp(player.MarketPrices[i] + delta, Market.MinPrice, Market.MaxPrice);
    }
}
