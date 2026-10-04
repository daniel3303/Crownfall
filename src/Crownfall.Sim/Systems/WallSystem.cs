using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
using Crownfall.Sim.World;

namespace Crownfall.Sim.Systems;

/// <summary>
/// Wall placement: dragged lines of wall foundations, and gates or wall towers set into an existing own wall, which
/// replace that wall tile and cost only the difference in price.
/// </summary>
public sealed class WallSystem
{
    /// <summary>Longest wall line one command may lay.</summary>
    public const int MaxLineTiles = 40;

    private readonly Game _game;

    public WallSystem(Game game)
    {
        _game = game;
    }

    /// <summary>
    /// Lays foundations along the line, skipping tiles that already hold the player's wall or cannot be built on,
    /// and stops at the first tile the player cannot pay for.
    /// </summary>
    public void BuildLine(Player player, BuildingDef def, BuildLineCommand command, List<Unit> builders)
    {
        var placed = new List<Building>();
        foreach (var (x, y) in TileLine.Between(command.X1, command.Y1, command.X2, command.Y2).Take(MaxLineTiles))
        {
            var rect = TileRect.Single(x, y);
            if (IsOwnWall(player, x, y) || !_game.Map.IsBuildable(rect, inShallows: true) || !_game.Vision.IsRectExplored(player.Team, rect))
            {
                continue;
            }
            if (!player.Stock.TrySpend(def.CostAmounts))
            {
                _game.Notify(player, $"Not enough {player.Stock.DescribeShortfall(def.CostAmounts)} to finish the {def.Name.ToLowerInvariant()}.", NoticeTone.Warning, null);
                break;
            }
            placed.Add(_game.PlaceBuilding(def, player, rect, complete: false));
        }
        if (placed.Count == 0)
        {
            return;
        }
        foreach (var builder in builders)
        {
            builder.ClearPath();
            builder.Order = UnitOrder.Build(Nearest(placed, builder.Position));
        }
    }

    /// <summary>
    /// Sets a gate or wall tower into a tile of the player's own wall. Returns false when the tile holds no such wall,
    /// so the caller places the building normally.
    /// </summary>
    public bool TryReplace(Player player, BuildingDef def, TileRect rect, List<Unit> builders)
    {
        if (!def.IsWall || def.IsLine || rect.Width != 1 || rect.Height != 1 || !IsOwnWall(player, rect.X, rect.Y))
        {
            return false;
        }
        var wall = (Building)_game.Entities.Get(_game.Map.Occupant(rect.X, rect.Y));
        var price = new int[Resources.Count];
        for (var i = 0; i < Resources.Count; i++)
        {
            price[i] = Math.Max(0, def.CostAmounts[i] - wall.Def.CostAmounts[i]);
        }
        if (!player.Stock.TrySpend(price))
        {
            _game.Notify(player, $"Not enough {player.Stock.DescribeShortfall(price)}.", NoticeTone.Warning, null);
            return true;
        }
        _game.RemoveBuilding(wall);
        var foundation = _game.PlaceBuilding(def, player, rect, complete: false);
        foreach (var builder in builders)
        {
            builder.ClearPath();
            builder.Order = UnitOrder.Build(foundation);
        }
        return true;
    }

    private bool IsOwnWall(Player player, int x, int y)
    {
        return _game.Entities.Get(_game.Map.Occupant(x, y)) is Building { Def.IsLine: true } wall && wall.IsAlive && wall.Owner == player;
    }

    private static Building Nearest(List<Building> buildings, Vector2 point)
    {
        var best = buildings[0];
        foreach (var building in buildings)
        {
            if (Vector2.DistanceSquared(building.Position, point) < Vector2.DistanceSquared(best.Position, point))
            {
                best = building;
            }
        }
        return best;
    }
}
