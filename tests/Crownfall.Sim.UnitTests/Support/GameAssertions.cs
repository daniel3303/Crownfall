using System.Numerics;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Entities;

namespace Crownfall.Sim.UnitTests.Support;

internal static class GameExtensions
{
    public static Building TownCenter(this Game game, Player player)
    {
        return game.Entities.Buildings.First(b => b.Owner == player && b.Def.IsTownCenter);
    }

    public static List<Unit> UnitsOf(this Game game, Player player, string unitId)
    {
        return game.Entities.Units.Where(u => u.Owner == player && u.Def.Id == unitId && u.IsAlive).ToList();
    }

    public static void Issue(this Game game, Player player, PlayerCommand command)
    {
        game.Step([new CommandEnvelope(player.Index, command)]);
    }

    /// <summary>A walkable point away from bases and creep camps, so no tower or creep interferes.</summary>
    public static Vector2 QuietSpot(this Game game)
    {
        for (var y = 4; y < game.Map.Height - 4; y++)
        {
            for (var x = 4; x < game.Map.Width - 4; x++)
            {
                var point = new Vector2(x + 0.5f, y + 0.5f);
                var clear = true;
                for (var dy = -4; dy <= 4 && clear; dy++)
                {
                    for (var dx = -4; dx <= 4 && clear; dx++)
                    {
                        clear = game.Map.IsWalkable(x + dx, y + dy);
                    }
                }
                var farFromCamps = game.Creeps.Camps.All(c => Vector2.Distance(c.Center, point) > 14);
                var farFromBuildings = game.Entities.Buildings.All(b => b.EdgeDistance(point) > 14);
                if (clear && farFromCamps && farFromBuildings)
                {
                    return point;
                }
            }
        }
        throw new InvalidOperationException("No quiet spot on this map.");
    }

    public static Unit Spawn(this Game game, string unitId, Player owner, Vector2 position)
    {
        return game.SpawnUnit(game.Content.Unit(unitId), owner, position);
    }

    /// <summary>Places a building on the first buildable spot scanning outward from a point; complete by default.</summary>
    public static Building Place(this Game game, string buildingId, Player owner, Vector2 near, bool complete = true)
    {
        var def = game.Content.Building(buildingId);
        for (var ring = 0; ring < 20; ring++)
        {
            for (var dy = -ring; dy <= ring; dy++)
            {
                for (var dx = -ring; dx <= ring; dx++)
                {
                    var rect = new Crownfall.Sim.World.TileRect((int)near.X + dx, (int)near.Y + dy, def.Size, def.Size);
                    if ((Math.Abs(dx) == ring || Math.Abs(dy) == ring) && game.Map.IsBuildable(rect))
                    {
                        var building = game.PlaceBuilding(def, owner, rect, complete);
                        game.Storage.Update();
                        return building;
                    }
                }
            }
        }
        throw new InvalidOperationException($"No room for a {buildingId} near {near}.");
    }

    /// <summary>The walkable tile center nearest to a point.</summary>
    public static Vector2 Walkable(this Game game, Vector2 point)
    {
        game.Pathfinder.TryNearestWalkable((int)point.X, (int)point.Y, out var x, out var y).Should().BeTrue();
        return new Vector2(x + 0.5f, y + 0.5f);
    }
}
