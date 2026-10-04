using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.Bots;

/// <summary>
/// Market use for a bot: sells a resource that is about to overflow its storage, buys with gold that is about to
/// overflow, and buys a resource the bot cannot gather at all once its gold covers the army's reserve with room
/// to spare. One trade every few seconds, so its own prices move slowly.
/// </summary>
public sealed class BotTrader
{
    private const float NearFull = 0.9f;
    private const float TradeIntervalSeconds = 4f;

    // Gold kept on top of the army reserve before buying a resource the bot cannot gather.
    private const int GoldBuffer = 150;

    private readonly Game _game;
    private readonly Player _player;
    private int _nextTradeTick;

    public BotTrader(Game game, Player player)
    {
        _game = game;
        _player = player;
    }

    public void Run(BotView view, int[] armyReserve, bool[] gatherable)
    {
        if (view.Tick < _nextTradeTick)
        {
            return;
        }
        var market = view.Buildings.FirstOrDefault(b => b.IsComplete && b.Def.Market);
        if (market == null)
        {
            return;
        }
        var trade = Sale(armyReserve) ?? Purchase(armyReserve, gatherable);
        if (trade is { } chosen)
        {
            _nextTradeTick = view.Tick + (int)(TradeIntervalSeconds * _game.Content.Rules.TickRate);
            _game.Commands.Apply(_player, new TradeCommand { Building = market.Id, Resource = chosen.Type, Buy = chosen.Buy });
        }
    }

    private (ResourceType Type, bool Buy)? Sale(int[] reserve)
    {
        var stock = _player.Stock;
        var lot = _game.Content.Rules.Market.Lot;
        foreach (var type in Tradable().OrderByDescending(Fullness))
        {
            if (Fullness(type) >= NearFull && stock[type] >= lot + reserve[(int)type] && stock.Room(ResourceType.Gold) >= _game.Market.SellPrice(_player, type))
            {
                return (type, false);
            }
        }
        return null;
    }

    private (ResourceType Type, bool Buy)? Purchase(int[] reserve, bool[] gatherable)
    {
        var stock = _player.Stock;
        var gold = stock[ResourceType.Gold];
        var goldFull = Fullness(ResourceType.Gold) >= NearFull;
        var lot = _game.Content.Rules.Market.Lot;
        foreach (var type in Tradable().OrderBy(Fullness))
        {
            var price = _game.Market.BuyPrice(_player, type);
            var stranded = !gatherable[(int)type] && stock[type] < lot + reserve[(int)type];
            var spare = gold >= price + reserve[(int)ResourceType.Gold] + GoldBuffer;
            if (stock.Room(type) >= lot && gold >= price && (goldFull || (stranded && spare)))
            {
                return (type, true);
            }
        }
        return null;
    }

    private IEnumerable<ResourceType> Tradable()
    {
        return Resources.All.Where(_game.Market.IsTradable);
    }

    private float Fullness(ResourceType type)
    {
        var cap = _player.Stock.Cap(type);
        return cap <= 0 ? 1 : (float)_player.Stock[type] / cap;
    }
}
