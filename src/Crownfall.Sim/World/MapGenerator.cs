using System.Numerics;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;

namespace Crownfall.Sim.World;

/// <summary>
/// Builds a seeded map: noise forests and lakes, team starts on a ring facing the center, carved paths,
/// mirrored starting resources per seat, scattered extra deposits, neutral camps and the dragon's lair at the center.
/// </summary>
public sealed class MapGenerator
{
    private const float StartRingFraction = 0.36f;
    private const float MaxTeamSpread = 0.9f;
    private const int StartClearRadius = 9;
    private const int CenterClearRadius = 5;
    private const float PathHalfWidth = 1.5f;
    private const float LakeThreshold = 0.74f;
    private const float ForestThreshold = 0.6f;
    private const int MinExtraDistanceFromStart = 16;
    private const int MinCampDistanceFromStart = 18;
    private const int MinCampSpacing = 12;
    private const int CampClearRadius = 2;
    private const int PlacementAttempts = 400;

    private readonly ContentDb _content;
    private readonly MatchConfig _config;
    private readonly Random _rng;
    private readonly List<StartLocation> _starts = [];
    private readonly List<CampPlacement> _camps = [];
    private GameMap _map;
    private PlacementGrid _grid;

    private MapGenerator(ContentDb content, MatchConfig config)
    {
        _content = content;
        _config = config;
        _rng = new Random(config.Seed);
    }

    private Vector2 MapCenter => new(_map.Width / 2f, _map.Height / 2f);

    public static MapLayout Generate(ContentDb content, MatchConfig config)
    {
        return new MapGenerator(content, config).Build();
    }

    private MapLayout Build()
    {
        var size = _config.MapTiles;
        _map = new GameMap(size, size);
        _grid = new PlacementGrid(_map);
        PaintTerrain();
        PlaceStarts();
        foreach (var start in _starts)
        {
            TerrainSculptor.ClearDisc(_map, start.Center, StartClearRadius);
            TerrainSculptor.CarveLine(_map, start.Center, MapCenter, PathHalfWidth);
        }
        TerrainSculptor.ClearDisc(_map, MapCenter, CenterClearRadius);
        TerrainSculptor.AddShores(_map);
        _grid.Reachable = TerrainSculptor.FloodFill(_map, _starts[0].Center);
        TerrainSculptor.PlantUnreachable(_map, _grid.Reachable, _content.Rules.TreeWood);
        foreach (var start in _starts)
        {
            _grid.Reserve(start.TownCenter.Inflate(1));
        }
        foreach (var start in _starts)
        {
            PlaceStartResources(start);
        }
        PlaceCamps();
        PlaceExtraResources();
        return new MapLayout { Map = _map, Starts = _starts, Nodes = _grid.Nodes, Camps = _camps, Lair = MapCenter };
    }

    private void PaintTerrain()
    {
        var size = _map.Width;
        var forestCoarse = ValueNoise.Generate(_rng, size, 7);
        var forestFine = ValueNoise.Generate(_rng, size, 3);
        var lakes = ValueNoise.Generate(_rng, size, 11);
        var treeWood = _content.Rules.TreeWood;
        for (var y = 0; y < size; y++)
        {
            for (var x = 0; x < size; x++)
            {
                var index = y * size + x;
                var border = x == 0 || y == 0 || x == size - 1 || y == size - 1;
                var forest = forestCoarse[index] * 0.65f + forestFine[index] * 0.35f;
                if (border || forest > ForestThreshold)
                {
                    _map.PlantTree(x, y, treeWood);
                }
                else if (lakes[index] > LakeThreshold)
                {
                    _map.SetTile(x, y, TileType.Water);
                }
            }
        }
    }

    private void PlaceStarts()
    {
        var radius = _map.Width * StartRingFraction;
        var baseAngle = _rng.NextSingle() * MathF.Tau;
        var perTeam = _config.PlayersPerTeam;
        var spread = perTeam == 1 ? 0 : MathF.Min(MaxTeamSpread, MathF.Tau / _config.Teams * 0.5f);
        for (var team = 0; team < _config.Teams; team++)
        {
            var teamAngle = baseAngle + team * MathF.Tau / _config.Teams;
            for (var slot = 0; slot < perTeam; slot++)
            {
                var offset = perTeam == 1 ? 0 : spread * (slot / (float)(perTeam - 1) - 0.5f);
                var angle = teamAngle + offset;
                var position = MapCenter + new Vector2(MathF.Cos(angle), MathF.Sin(angle)) * radius;
                var rect = new TileRect((int)MathF.Round(position.X) - 2, (int)MathF.Round(position.Y) - 2, 4, 4);
                var toCenter = MapCenter - rect.Center;
                _starts.Add(new StartLocation
                {
                    Team = team,
                    Slot = slot,
                    TownCenter = rect,
                    Facing = MathF.Atan2(toCenter.Y, toCenter.X),
                });
            }
        }
    }

    private void PlaceStartResources(StartLocation start)
    {
        var facing = start.Facing;
        var berriesCenter = Offset(start.Center, facing + 1.75f, 7f);
        var berries = _content.Node("berries");
        int[][] bushOffsets = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]];
        var placed = 0;
        foreach (var offset in bushOffsets)
        {
            if (placed == 5)
            {
                break;
            }
            var x = (int)berriesCenter.X + offset[0];
            var y = (int)berriesCenter.Y + offset[1];
            if (_grid.TryPlaceNode(berries, new TileRect(x, y, 1, 1), 0))
            {
                placed++;
            }
        }
        _grid.PlaceNodeNear(_content.Node("goldMine"), Offset(start.Center, facing - 1.75f, 8.5f), 1, 4);
        _grid.PlaceNodeNear(_content.Node("stoneMine"), Offset(start.Center, facing + MathF.PI - 0.7f, 9.5f), 1, 4);
        _grid.PlantGrove(Offset(start.Center, facing + MathF.PI + 0.6f, 11f), 2.6f, start.TownCenter.Inflate(2), _content.Rules.TreeWood);
    }

    private void PlaceExtraResources()
    {
        var players = _config.PlayerCount;
        for (var i = 0; i < players; i++)
        {
            PlaceRandomNode(_content.Node("goldMine"));
        }
        for (var i = 0; i < (players + 1) / 2; i++)
        {
            PlaceRandomNode(_content.Node("stoneMine"));
            PlaceRandomBerryCluster();
        }
    }

    /// <summary>The center is the dragon's lair; the troll's camp is the first one placed elsewhere, then the wolves'.</summary>
    private void PlaceCamps()
    {
        TerrainSculptor.ClearDisc(_map, MapCenter, CampClearRadius);
        ReserveCampArea(MapCenter);
        var wanted = Math.Max(2, _config.PlayerCount) + 1;
        for (var attempt = 0; attempt < PlacementAttempts && _camps.Count < wanted; attempt++)
        {
            var point = RandomReachablePoint();
            if (DistanceToNearestStart(point) < MinCampDistanceFromStart)
            {
                continue;
            }
            if (Vector2.Distance(MapCenter, point) < MinCampSpacing || _camps.Any(c => Vector2.Distance(c.Center, point) < MinCampSpacing))
            {
                continue;
            }
            TerrainSculptor.ClearDisc(_map, point, CampClearRadius);
            AddCamp(point, _camps.Count == 0 ? ["troll", "wolf", "wolf"] : ["wolf", "wolf", "wolf"]);
        }
    }

    private void AddCamp(Vector2 center, IReadOnlyList<string> members)
    {
        _camps.Add(new CampPlacement(center, members));
        ReserveCampArea(center);
    }

    private void ReserveCampArea(Vector2 center)
    {
        var reach = CampClearRadius + 1;
        _grid.Reserve(new TileRect((int)center.X - reach, (int)center.Y - reach, reach * 2 + 1, reach * 2 + 1));
    }

    private void PlaceRandomNode(NodeDef def)
    {
        for (var attempt = 0; attempt < PlacementAttempts; attempt++)
        {
            var point = RandomReachablePoint();
            if (DistanceToNearestStart(point) < MinExtraDistanceFromStart)
            {
                continue;
            }
            var rect = new TileRect((int)point.X, (int)point.Y, def.Size, def.Size);
            if (_grid.TryPlaceNode(def, rect, 2))
            {
                return;
            }
        }
    }

    private void PlaceRandomBerryCluster()
    {
        var berries = _content.Node("berries");
        for (var attempt = 0; attempt < PlacementAttempts; attempt++)
        {
            var point = RandomReachablePoint();
            if (DistanceToNearestStart(point) < MinExtraDistanceFromStart || !_grid.CanPlace(new TileRect((int)point.X - 1, (int)point.Y - 1, 3, 2), 1))
            {
                continue;
            }
            for (var i = 0; i < 3; i++)
            {
                _grid.TryPlaceNode(berries, new TileRect((int)point.X - 1 + i, (int)point.Y, 1, 1), 0);
            }
            return;
        }
    }

    private Vector2 RandomReachablePoint()
    {
        while (true)
        {
            var x = _rng.Next(PlacementGrid.EdgeMargin, _map.Width - PlacementGrid.EdgeMargin);
            var y = _rng.Next(PlacementGrid.EdgeMargin, _map.Height - PlacementGrid.EdgeMargin);
            if (_grid.Reachable[_map.Index(x, y)] && GameMap.IsBuildableTerrain(_map.Tile(x, y)))
            {
                return new Vector2(x + 0.5f, y + 0.5f);
            }
        }
    }

    private float DistanceToNearestStart(Vector2 point)
    {
        return _starts.Min(s => Vector2.Distance(s.Center, point));
    }

    private static Vector2 Offset(Vector2 origin, float angle, float distance)
    {
        return origin + new Vector2(MathF.Cos(angle), MathF.Sin(angle)) * distance;
    }
}
