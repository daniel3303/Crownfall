using System.Numerics;
using Crownfall.Sim.Content;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Systems;

/// <summary>Advances training queues, enforces the population cap and sends new units to the rally point.</summary>
public sealed class ProductionSystem
{
    private const float HousedNoticeSeconds = 15f;
    private const int SpawnSearchRadius = 4;

    private readonly Game _game;

    public ProductionSystem(Game game)
    {
        _game = game;
    }

    public void Update()
    {
        foreach (var building in _game.Entities.Buildings)
        {
            if (building.IsAlive && building.IsComplete && !building.IsUpgrading && building.Queue.Count > 0)
            {
                Advance(building);
            }
        }
    }

    public float TrainSeconds(Player owner, UnitDef unit)
    {
        return unit.TrainTime * (unit.IsMilitary ? owner.Race.TrainTimeMultiplier : 1);
    }

    /// <summary>Train time at a particular building, whose level may speed training up.</summary>
    public float TrainSeconds(Building building, UnitDef unit)
    {
        return TrainSeconds(building.Owner, unit) / building.Stats.TrainSpeed;
    }

    private void Advance(Building building)
    {
        var item = building.Queue[0];
        var owner = building.Owner;
        if (item.Progress <= 0)
        {
            if (owner.Population + item.Unit.Pop > owner.PopulationCap)
            {
                WarnHoused(owner, building);
                return;
            }
            owner.Population += item.Unit.Pop;
        }
        item.Progress += _game.Dt / TrainSeconds(building, item.Unit);
        if (item.Progress < 1)
        {
            return;
        }
        building.Queue.RemoveAt(0);
        var unit = _game.SpawnUnit(item.Unit, owner, SpawnPoint(building));
        ApplyRank(unit, building.Stats);
        owner.Stats.UnitsTrained++;
        _game.Events.Add(new CompletedEvent { Player = owner.Index, Id = unit.Id, What = item.Unit.Id });
        SendToRally(building, unit);
    }

    /// <summary>A unit trained at an upgraded barracks comes out with that level's extra health and attack.</summary>
    private static void ApplyRank(Unit unit, BuildingStats stats)
    {
        if (stats.TroopHp == 1 && stats.TroopAttack == 1)
        {
            return;
        }
        unit.Rank = stats.Level;
        unit.RankAttack = stats.TroopAttack;
        unit.MaxHp *= stats.TroopHp;
        unit.Hp = unit.MaxHp;
    }

    private void WarnHoused(Player owner, Building building)
    {
        if ((_game.Tick - owner.LastHousedNoticeTick) * _game.Dt < HousedNoticeSeconds)
        {
            return;
        }
        owner.LastHousedNoticeTick = _game.Tick;
        var text = owner.PopulationCap >= _game.Content.Rules.PopulationLimit
            ? "Population limit reached."
            : "Need more houses to train units.";
        _game.Notify(owner, text, NoticeTone.Warning, building.Position);
    }

    /// <summary>The free tile beside the building nearest its rally; dry ground first, shallows only when nothing dry is near.</summary>
    private Vector2 SpawnPoint(Building building)
    {
        if (TryFindSpawn(building, wade: false, out var dry))
        {
            return dry;
        }
        return TryFindSpawn(building, wade: true, out var wet) ? wet : building.Position;
    }

    private bool TryFindSpawn(Building building, bool wade, out Vector2 best)
    {
        var toward = building.HasRally ? building.Rally : _game.MapCenter;
        var rect = building.Rect.Inflate(1);
        best = building.Position;
        var bestDistance = float.MaxValue;
        for (var ring = 0; ring < SpawnSearchRadius; ring++)
        {
            var area = rect.Inflate(ring);
            for (var y = area.Y; y < area.Y + area.Height; y++)
            {
                for (var x = area.X; x < area.X + area.Width; x++)
                {
                    var onEdge = x == area.X || y == area.Y || x == area.X + area.Width - 1 || y == area.Y + area.Height - 1;
                    if (!onEdge || !_game.Map.IsWalkable(x, y) || !wade && _game.Map.IsShallow(x, y))
                    {
                        continue;
                    }
                    var point = new Vector2(x + 0.5f, y + 0.5f);
                    var distance = Vector2.DistanceSquared(point, toward);
                    if (distance < bestDistance)
                    {
                        bestDistance = distance;
                        best = point;
                    }
                }
            }
            if (bestDistance < float.MaxValue)
            {
                return true;
            }
        }
        return false;
    }

    private void SendToRally(Building building, Unit unit)
    {
        if (!building.HasRally)
        {
            return;
        }
        var rally = building.Rally;
        if (unit.Def.IsVillager && TryGatherAtRally(unit, rally))
        {
            return;
        }
        unit.Order = UnitOrder.Move(rally);
    }

    private bool TryGatherAtRally(Unit unit, Vector2 rally)
    {
        var x = (int)MathF.Floor(rally.X);
        var y = (int)MathF.Floor(rally.Y);
        if (_game.Map.Tile(x, y) == TileType.Tree && _game.Map.InBounds(x, y))
        {
            unit.Order = UnitOrder.GatherTree(x, y);
            return true;
        }
        var occupant = _game.Entities.Get(_game.Map.Occupant(x, y));
        if (occupant is ResourceNode node)
        {
            unit.Order = UnitOrder.GatherNode(node);
            return true;
        }
        if (occupant is Building farm && _game.Finder.IsFarmAvailable(farm, unit))
        {
            farm.FarmWorker = unit;
            unit.Order = UnitOrder.GatherNode(farm);
            return true;
        }
        return false;
    }
}
