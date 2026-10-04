using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;

namespace Crownfall.Sim.Systems;

/// <summary>
/// Storage caps: each completed building adds its level's storage to its owner's stockpile, for every resource.
/// Income past a cap is lost, and the player hears about it at most once per notice interval.
/// </summary>
public sealed class StorageSystem
{
    public const string FullNotice = "Storage full: build or upgrade storehouses.";

    private readonly Game _game;

    public StorageSystem(Game game)
    {
        _game = game;
    }

    /// <summary>Recounts every stockpile's caps; teammates sharing a stockpile pool their buildings.</summary>
    public void Update()
    {
        var caps = new Dictionary<Stockpile, int>();
        foreach (var player in _game.Players)
        {
            caps[player.Stock] = 0;
        }
        foreach (var building in _game.Entities.Buildings)
        {
            if (building.IsAlive && building.IsComplete && building.Owner != null)
            {
                caps[building.Owner.Stock] += building.Stats.Storage;
            }
        }
        foreach (var (stock, cap) in caps)
        {
            foreach (var type in Resources.All)
            {
                stock.SetCap(type, cap);
            }
        }
    }

    /// <summary>Adds income for a player, warning them when part of it overflowed. Returns the amount kept.</summary>
    public int Store(Player player, ResourceType type, int amount)
    {
        var lost = player.Stock.Store(type, amount);
        if (lost > 0)
        {
            WarnFull(player);
        }
        return amount - lost;
    }

    public void Store(Player player, int[] amounts)
    {
        for (var i = 0; i < Resources.Count; i++)
        {
            if (amounts[i] > 0)
            {
                Store(player, (ResourceType)i, amounts[i]);
            }
        }
    }

    private void WarnFull(Player player)
    {
        if ((_game.Tick - player.LastStorageNoticeTick) * _game.Dt < _game.Content.Rules.StorageFullNoticeSeconds)
        {
            return;
        }
        player.LastStorageNoticeTick = _game.Tick;
        _game.Notify(player, FullNotice, NoticeTone.Warning, null);
    }
}
