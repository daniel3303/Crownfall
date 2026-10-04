using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Systems;

/// <summary>Validates and applies player commands. Humans and bots go through exactly this path.</summary>
public sealed class CommandProcessor
{
    private const float FormationSpacing = 0.9f;
    private const int MaxTributeAmount = 100000;

    private readonly Game _game;

    public CommandProcessor(Game game)
    {
        _game = game;
    }

    public void Apply(Player player, PlayerCommand command)
    {
        if (player.IsDefeated)
        {
            return;
        }
        switch (command)
        {
            case MoveCommand move:
                ApplyMove(player, move);
                break;
            case AttackCommand attack:
                ApplyAttack(player, attack);
                break;
            case GatherCommand gather:
                ApplyGather(player, gather);
                break;
            case BuildCommand build:
                ApplyBuild(player, build);
                break;
            case BuildLineCommand line:
                ApplyBuildLine(player, line);
                break;
            case ConstructCommand construct:
                ApplyConstruct(player, construct);
                break;
            case StopCommand stop:
                foreach (var unit in OwnUnits(player, stop))
                {
                    OrderSystem.SetIdle(unit);
                }
                break;
            case TrainCommand train:
                ApplyTrain(player, train);
                break;
            case CancelTrainCommand cancel:
                ApplyCancel(player, cancel);
                break;
            case RallyCommand rally:
                ApplyRally(player, rally);
                break;
            case AbilityCommand ability:
                _game.Abilities.Cast(player, ability.Slot, ClampToMap(ability.X, ability.Y));
                break;
            case HeroStatCommand stat:
                _game.Heroes.LearnStat(player, stat.Stat);
                break;
            case PickTalentCommand talent:
                _game.Heroes.PickTalent(player, talent.Tier, talent.Talent);
                break;
            case ReviveHeroCommand revive:
                _game.Heroes.Revive(player, revive.Building);
                break;
            case BuyItemCommand buy:
                _game.Shop.Buy(player, buy.Item);
                break;
            case SellItemCommand sell:
                _game.Shop.Sell(player, sell.Slot);
                break;
            case TributeCommand tribute:
                ApplyTribute(player, tribute);
                break;
            case UpgradeCommand upgrade:
                _game.Upgrades.Start(player, upgrade.Building);
                break;
            case CancelUpgradeCommand cancelUpgrade:
                _game.Upgrades.Cancel(player, cancelUpgrade.Building);
                break;
            case TradeCommand trade:
                _game.Market.Trade(player, trade.Building, trade.Resource, trade.Buy);
                break;
        }
    }

    private void ApplyMove(Player player, MoveCommand command)
    {
        var units = OwnUnits(player, command);
        var center = ClampToMap(command.X, command.Y);
        for (var i = 0; i < units.Count; i++)
        {
            var point = FormationPoint(center, i);
            units[i].ClearPath();
            units[i].Order = command.AttackMove ? UnitOrder.AttackMove(point) : UnitOrder.Move(point);
        }
    }

    private void ApplyAttack(Player player, AttackCommand command)
    {
        var target = _game.Entities.Get(command.Target);
        if (target == null || target is ResourceNode)
        {
            return;
        }
        var units = OwnUnits(player, command);
        if (target.Team == player.Team && target.Owner != null)
        {
            ApplyMove(player, new MoveCommand { Units = command.Units, X = target.Position.X, Y = target.Position.Y });
            return;
        }
        if (!_game.Vision.IsVisible(player.Team, target))
        {
            return;
        }
        foreach (var unit in units)
        {
            unit.ClearPath();
            unit.Order = UnitOrder.Attack(target);
        }
    }

    private void ApplyGather(Player player, GatherCommand command)
    {
        var order = GatherOrderFor(player, command);
        if (order == null)
        {
            return;
        }
        var raid = RaidSystem.IsRaid(order, player);
        foreach (var unit in OwnUnits(player, command))
        {
            unit.ClearPath();
            unit.Order = unit.Def.IsVillager ? order
                : raid ? UnitOrder.Attack(order.Target)
                : UnitOrder.Move(GatherPoint(order));
        }
    }

    private UnitOrder GatherOrderFor(Player player, GatherCommand command)
    {
        if (command.Target == 0)
        {
            var isTree = _game.Map.Tile(command.TileX, command.TileY) == TileType.Tree && _game.Map.InBounds(command.TileX, command.TileY);
            var explored = _game.Vision.IsTileExplored(player.Team, command.TileX, command.TileY);
            return isTree && explored ? UnitOrder.GatherTree(command.TileX, command.TileY) : null;
        }
        var target = _game.Entities.Get(command.Target);
        if (target is ResourceNode node && _game.Vision.IsRectExplored(player.Team, node.Rect))
        {
            return UnitOrder.GatherNode(node);
        }
        if (target is Building { IsComplete: true } farm && farm.Def.IsFarm && farm.Owner == player)
        {
            return UnitOrder.GatherNode(farm);
        }
        if (target is Building store && RaidSystem.IsRaidable(store, player) && _game.Vision.IsVisible(player.Team, store))
        {
            return UnitOrder.GatherNode(store);
        }
        return null;
    }

    private static Vector2 GatherPoint(UnitOrder order)
    {
        return order.HasTree ? new Vector2(order.TreeX + 0.5f, order.TreeY + 0.5f) : order.Target.Position;
    }

    private void ApplyBuild(Player player, BuildCommand command)
    {
        if (!_game.Content.TryGetBuilding(command.Building, out var def))
        {
            return;
        }
        var builders = OwnUnits(player, command).Where(u => u.Def.IsVillager).ToList();
        if (builders.Count == 0)
        {
            return;
        }
        var rect = new TileRect(command.X, command.Y, def.Size, def.Size);
        if (_game.Walls.TryReplace(player, def, rect, builders))
        {
            return;
        }
        if (!_game.Map.IsBuildable(rect, inShallows: def.IsWall) || !_game.Vision.IsRectExplored(player.Team, rect))
        {
            _game.Notify(player, "Can't build there.", NoticeTone.Warning, rect.Center);
            return;
        }
        if (!player.Stock.TrySpend(def.CostAmounts))
        {
            _game.Notify(player, $"Not enough {player.Stock.DescribeShortfall(def.CostAmounts)}.", NoticeTone.Warning, null);
            return;
        }
        var foundation = _game.PlaceBuilding(def, player, rect, complete: false);
        foreach (var builder in builders)
        {
            builder.ClearPath();
            builder.Order = UnitOrder.Build(foundation);
        }
    }

    private void ApplyBuildLine(Player player, BuildLineCommand command)
    {
        if (!_game.Content.TryGetBuilding(command.Building, out var def) || !def.IsLine)
        {
            return;
        }
        var builders = OwnUnits(player, command).Where(u => u.Def.IsVillager).ToList();
        if (builders.Count > 0)
        {
            _game.Walls.BuildLine(player, def, command, builders);
        }
    }

    private void ApplyConstruct(Player player, ConstructCommand command)
    {
        if (_game.Entities.Get(command.Target) is not Building { IsComplete: false } foundation || foundation.Team != player.Team)
        {
            return;
        }
        foreach (var unit in OwnUnits(player, command).Where(u => u.Def.IsVillager))
        {
            unit.ClearPath();
            unit.Order = UnitOrder.Build(foundation);
        }
    }

    private void ApplyTrain(Player player, TrainCommand command)
    {
        if (_game.Entities.Get(command.Building) is not Building building || building.Owner != player || !building.IsComplete)
        {
            return;
        }
        var unit = building.Def.TrainableUnits.FirstOrDefault(u => u.Id == command.Unit);
        if (unit == null || !unit.AllowsRace(player.Race.Id) || building.Queue.Count >= Building.MaxQueue)
        {
            return;
        }
        if (!unit.TrainsAtLevel(building.Level))
        {
            _game.Notify(player, $"{unit.Name} needs a level {unit.RequiresTrainerLevel} {building.Def.Name}.", NoticeTone.Warning, null);
            return;
        }
        if (!player.Stock.TrySpend(unit.CostAmounts))
        {
            _game.Notify(player, $"Not enough {player.Stock.DescribeShortfall(unit.CostAmounts)}.", NoticeTone.Warning, null);
            return;
        }
        building.Queue.Add(new ProductionItem(unit, (int[])unit.CostAmounts.Clone()));
    }

    private void ApplyCancel(Player player, CancelTrainCommand command)
    {
        if (_game.Entities.Get(command.Building) is not Building building || building.Owner != player || building.Queue.Count == 0)
        {
            return;
        }
        var item = building.Queue[^1];
        building.Queue.RemoveAt(building.Queue.Count - 1);
        if (item.Progress > 0)
        {
            player.Population -= item.Unit.Pop;
        }
        player.Stock.Add(item.PaidCost);
    }

    private void ApplyRally(Player player, RallyCommand command)
    {
        if (_game.Entities.Get(command.Building) is not Building building || building.Owner != player || building.Def.Trains.Count == 0)
        {
            return;
        }
        building.HasRally = true;
        building.Rally = ClampToMap(command.X, command.Y);
    }

    private void ApplyTribute(Player player, TributeCommand command)
    {
        if (_game.Config.Sharing != ResourceSharing.SeparateWithTribute || !Enum.IsDefined(command.Resource))
        {
            return;
        }
        var recipient = _game.PlayerAt(command.To);
        if (recipient == null || recipient == player || recipient.Team != player.Team || recipient.IsDefeated)
        {
            return;
        }
        var resource = Resources.Name(command.Resource);
        var amount = TributeThatFits(Math.Clamp(command.Amount, 0, MaxTributeAmount), recipient.Stock.Room(command.Resource));
        if (amount <= 0)
        {
            _game.Notify(player, $"{recipient.Name} has no room to store more {resource}.", NoticeTone.Warning, null);
            return;
        }
        if (!player.Stock.TryTake(command.Resource, amount))
        {
            _game.Notify(player, $"Not enough {resource} to send.", NoticeTone.Warning, null);
            return;
        }
        var received = TributeReceived(amount);
        recipient.Stock.Store(command.Resource, received);
        _game.Notify(player, $"Sent {received} {resource} to {recipient.Name}.", NoticeTone.Success, null);
        _game.Notify(recipient, $"{player.Name} sent you {received} {resource}.", NoticeTone.Success, null);
    }

    private int TributeReceived(int amount)
    {
        return amount - (int)MathF.Floor(amount * _game.Content.Rules.TributeTax);
    }

    /// <summary>The largest part of a tribute whose taxed amount still fits the recipient's storage.</summary>
    private int TributeThatFits(int amount, int room)
    {
        while (amount > 0 && TributeReceived(amount) > room)
        {
            amount = Math.Min(amount - 1, (int)(room / (1 - _game.Content.Rules.TributeTax)));
        }
        return amount;
    }

    private List<Unit> OwnUnits(Player player, UnitsCommand command)
    {
        var result = new List<Unit>();
        foreach (var id in command.Units.Distinct().Take(UnitsCommand.MaxUnits))
        {
            if (_game.Entities.Get(id) is Unit unit && unit.Owner == player && unit.IsAlive)
            {
                result.Add(unit);
            }
        }
        return result;
    }

    private Vector2 FormationPoint(Vector2 center, int index)
    {
        if (index == 0)
        {
            return center;
        }
        var ring = (int)MathF.Ceiling((MathF.Sqrt(index + 1) - 1) / 2);
        var side = ring * 2;
        var position = index - (side - 1) * (side - 1);
        var offset = ring switch
        {
            _ when position < side => new Vector2(ring, -ring + position),
            _ when position < side * 2 => new Vector2(ring - (position - side), ring),
            _ when position < side * 3 => new Vector2(-ring, ring - (position - side * 2)),
            _ => new Vector2(-ring + (position - side * 3), -ring),
        };
        var point = ClampToMap(center.X + offset.X * FormationSpacing, center.Y + offset.Y * FormationSpacing);
        return _game.Map.IsWalkable(point) ? point : center;
    }

    private Vector2 ClampToMap(float x, float y)
    {
        if (!float.IsFinite(x) || !float.IsFinite(y))
        {
            return _game.MapCenter;
        }
        return new Vector2(Math.Clamp(x, 0.5f, _game.Map.Width - 0.5f), Math.Clamp(y, 0.5f, _game.Map.Height - 0.5f));
    }
}
