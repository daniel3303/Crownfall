using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Systems;

namespace Crownfall.Sim.Bots;

/// <summary>
/// Sends a villager or two to rob an enemy storehouse or town center the bot can see near home, but only when no
/// tower, town center or enemy soldier guards it and the bot's own base is calm. Easy bots never raid.
/// </summary>
public sealed class BotRaids
{
    private const float CheckSeconds = 20f;
    private const int MinVillagers = 14;
    private const int MaxThieves = 2;
    private const float RaidRange = 28f;
    private const float GuardRadius = 8f;

    private readonly Game _game;
    private readonly Player _player;
    private readonly BotMemory _memory;
    private int _nextCheckTick;

    public BotRaids(Game game, Player player, BotMemory memory)
    {
        _game = game;
        _player = player;
        _memory = memory;
    }

    public void Run(BotView view, bool threatened)
    {
        if (_player.BotDifficulty == BotDifficulty.Easy || view.Tick < _nextCheckTick)
        {
            return;
        }
        _nextCheckTick = view.Tick + (int)(CheckSeconds * _game.Content.Rules.TickRate);
        var thieves = view.Villagers.Count(IsThief);
        if (threatened || view.Villagers.Count < MinVillagers || thieves >= MaxThieves)
        {
            return;
        }
        var target = Target(view);
        var thief = target == null ? null : view.Villagers
            .Where(v => !IsThief(v) && BotJobs.GatherOrder(v) != null)
            .OrderBy(v => Vector2.DistanceSquared(v.Position, target.Position))
            .ThenBy(v => v.Id)
            .FirstOrDefault();
        if (thief != null)
        {
            _game.Commands.Apply(_player, new GatherCommand { Units = [thief.Id], Target = target.Id });
        }
    }

    public static bool IsThief(Unit villager)
    {
        return BotJobs.GatherOrder(villager) is { } order && RaidSystem.IsRaid(order, villager.Owner);
    }

    private Building Target(BotView view)
    {
        return view.EnemyBuildings
            .Where(b => RaidSystem.IsRaidable(b, _player) && Vector2.Distance(b.Position, view.Home) <= RaidRange)
            .Where(b => !IsGuarded(view, b))
            .OrderBy(b => Vector2.DistanceSquared(b.Position, view.Home))
            .ThenBy(b => b.Id)
            .FirstOrDefault();
    }

    private bool IsGuarded(BotView view, Building building)
    {
        if (building.Stats.Attack != null || _memory.DefensePowerNear(building.Position, GuardRadius) > 0)
        {
            return true;
        }
        return view.EnemyUnits.Any(u => (u.Def.IsMilitary || u.IsHero) && Vector2.Distance(u.Position, building.Position) <= GuardRadius);
    }
}
