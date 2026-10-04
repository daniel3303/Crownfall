using System.Numerics;
using Crownfall.Sim.Bots;
using Crownfall.Sim.Commands;
using Crownfall.Sim.Content;
using Crownfall.Sim.Core;
using Crownfall.Sim.Entities;
using Crownfall.Sim.Events;
using Crownfall.Sim.Pathfinding;
using Crownfall.Sim.Systems;
using Crownfall.Sim.World;

namespace Crownfall.Sim;

/// <summary>
/// One match's authoritative simulation. Single-threaded: the host applies queued commands and calls
/// <see cref="Step"/> once per tick. Same seed and same commands replay the same match.
/// </summary>
public sealed class Game
{
    private readonly SortedDictionary<int, BotController> _bots = [];

    public Game(ContentDb content, MatchConfig config, IReadOnlyList<PlayerSetup> setups)
    {
        Content = content;
        Config = config.Normalized();
        MatchSetup.Validate(content, Config, setups);
        Layout = MapGenerator.Generate(content, Config);
        Map = Layout.Map;
        Dt = content.TickSeconds;
        Rng = new Random(Config.Seed ^ 0x5bd1e995);
        Entities = new EntityStore();
        Vision = new VisionSystem(Map, Config.Teams);
        Pathfinder = new Pathfinder(Map) { WallHealth = WallHealth };
        Spatial = new SpatialIndex(Map.Width, Map.Height);
        Movement = new MovementSystem(this);
        Orders = new OrderSystem(this);
        Finder = new ResourceFinder(this);
        Economy = new EconomySystem(this);
        Production = new ProductionSystem(this);
        Combat = new CombatSystem(this);
        Heroes = new HeroSystem(this);
        Abilities = new AbilitySystem(this);
        Creeps = new CreepSystem(this);
        Victory = new VictorySystem(this);
        Commands = new CommandProcessor(this);
        Population = new PopulationSystem(this);
        Storage = new StorageSystem(this);
        Upgrades = new UpgradeSystem(this);
        Raids = new RaidSystem(this);
        Walls = new WallSystem(this);
        Players = MatchSetup.CreatePlayers(content, Config, Layout, setups);
        Market = new MarketSystem(this);
        Shop = new ShopSystem(this);
        Dragon = new DragonSystem(this);
        MatchSetup.Populate(this);
        foreach (var player in Players.Where(p => p.IsBot))
        {
            _bots[player.Index] = new BotController(this, player);
        }
        Population.Update();
        Storage.Update();
        Spatial.Rebuild(Entities.Units);
        Vision.Update(Entities);
    }

    public ContentDb Content { get; }
    public MatchConfig Config { get; }
    public MapLayout Layout { get; }
    public GameMap Map { get; }
    public float Dt { get; }
    public Random Rng { get; }
    public EntityStore Entities { get; }
    public List<Player> Players { get; }
    public List<GameEvent> Events { get; } = [];
    public VisionSystem Vision { get; }
    public Pathfinder Pathfinder { get; }
    public SpatialIndex Spatial { get; }
    public MovementSystem Movement { get; }
    public OrderSystem Orders { get; }
    public ResourceFinder Finder { get; }
    public EconomySystem Economy { get; }
    public ProductionSystem Production { get; }
    public CombatSystem Combat { get; }
    public HeroSystem Heroes { get; }
    public AbilitySystem Abilities { get; }
    public CreepSystem Creeps { get; }
    public VictorySystem Victory { get; }
    public CommandProcessor Commands { get; }
    public PopulationSystem Population { get; }
    public StorageSystem Storage { get; }
    public UpgradeSystem Upgrades { get; }
    public RaidSystem Raids { get; }
    public WallSystem Walls { get; }
    public MarketSystem Market { get; }
    public ShopSystem Shop { get; }
    public DragonSystem Dragon { get; }
    public int Tick { get; private set; }
    public bool IsOver { get; private set; }
    public int WinningTeam { get; private set; } = -1;
    public Vector2 MapCenter => new(Map.Width / 2f, Map.Height / 2f);

    public Player PlayerAt(int index)
    {
        return index >= 0 && index < Players.Count ? Players[index] : null;
    }

    public void Step(IReadOnlyList<CommandEnvelope> commands)
    {
        if (IsOver)
        {
            return;
        }
        Tick++;
        Events.Clear();
        Pathfinder.BeginTick();
        foreach (var envelope in commands)
        {
            var player = PlayerAt(envelope.PlayerIndex);
            if (player is { IsBot: false })
            {
                Commands.Apply(player, envelope.Command);
            }
        }
        foreach (var bot in _bots.Values)
        {
            bot.Think();
        }
        Upgrades.Update();
        Production.Update();
        Market.Update();
        Dragon.Update();
        Heroes.Update();
        Abilities.Update();
        var units = Entities.Units;
        var count = units.Count;
        for (var i = 0; i < count; i++)
        {
            Orders.Update(units[i]);
        }
        Movement.Separate();
        Combat.Update();
        Creeps.Update();
        Entities.Sweep();
        Population.Update();
        Storage.Update();
        Vision.Update(Entities);
        FlushTileChanges();
        Victory.Update();
        foreach (var bot in _bots.Values)
        {
            bot.Witness(Events);
        }
    }

    /// <summary>Hands a seat to a bot when its human leaves, or back to a human who takes it over.</summary>
    public void SetBotControl(Player player, bool isBot, string name)
    {
        player.IsBot = isBot;
        player.Name = name;
        if (isBot && !_bots.ContainsKey(player.Index))
        {
            _bots[player.Index] = new BotController(this, player);
        }
        else if (!isBot)
        {
            _bots.Remove(player.Index);
        }
    }

    public void End(int winningTeam)
    {
        IsOver = true;
        WinningTeam = winningTeam;
    }

    public Unit SpawnUnit(UnitDef def, Player owner, Vector2 position)
    {
        var maxHp = def.Hp;
        if (owner != null && def.IsMilitary)
        {
            maxHp *= owner.Race.MilitaryHpMultiplier;
        }
        if (def.IsHero && owner != null)
        {
            maxHp += owner.HeroState.BonusHp;
        }
        var unit = new Unit(def)
        {
            Owner = owner,
            Position = position,
            MaxHp = maxHp,
            Hp = maxHp,
            Facing = Rng.NextSingle() * MathF.Tau,
            Hero = def.IsHero ? owner?.HeroState : null,
        };
        return Entities.Add(unit);
    }

    public Building PlaceBuilding(BuildingDef def, Player owner, TileRect rect, bool complete)
    {
        var maxHp = BuildingMaxHp(def.StatsAt(1), owner);
        var building = Entities.Add(new Building(def, rect)
        {
            Owner = owner,
            MaxHp = maxHp,
            Hp = complete ? maxHp : 1,
            IsComplete = complete,
            Progress = complete ? 1 : 0,
        });
        Map.Occupy(rect, building.Id, !def.Walkable);
        if (def.IsWall)
        {
            Map.MarkWall(rect, owner.Team);
        }
        if (complete && def.IsGate)
        {
            Map.OpenGate(rect);
        }
        if (!def.Walkable)
        {
            PushUnitsOut(rect);
        }
        return building;
    }

    public float BuildingMaxHp(BuildingStats stats, Player owner)
    {
        return stats.Hp * owner.Race.BuildingHpMultiplier;
    }

    private float WallHealth(int id)
    {
        return Entities.Get(id) is { MaxHp: > 0 } wall ? wall.Hp / wall.MaxHp : 1f;
    }

    public void CompleteBuilding(Building building)
    {
        building.IsComplete = true;
        building.Progress = 1;
        building.Owner.Stats.BuildingsBuilt++;
        if (building.Def.IsGate)
        {
            Map.OpenGate(building.Rect);
        }
        Events.Add(new CompletedEvent { Player = building.Owner.Index, Id = building.Id, What = building.Def.Id });
    }

    /// <summary>Takes a building off the map without a death or a kill, as when a gate replaces a wall tile.</summary>
    public void RemoveBuilding(Building building)
    {
        Map.Vacate(building.Rect, building.Id);
        Entities.MarkRemoved(building);
    }

    /// <summary>Takes a depleted deposit off the map for good.</summary>
    public void RemoveNode(ResourceNode node)
    {
        if (node.IsRemoved)
        {
            return;
        }
        Map.Vacate(node.Rect, node.Id);
        Entities.MarkRemoved(node);
        Events.Add(new DeathEvent { Id = node.Id, Owner = -1, EntityKind = node.Kind, X = node.Position.X, Y = node.Position.Y, Category = "node" });
    }

    public void Kill(Entity target, Player killer)
    {
        if (target.IsRemoved)
        {
            return;
        }
        target.Hp = 0;
        Entities.MarkRemoved(target);
        Events.Add(new DeathEvent
        {
            Id = target.Id,
            Owner = target.Owner?.Index ?? -1,
            EntityKind = target.Kind,
            X = target.Position.X,
            Y = target.Position.Y,
            Category = target is Building ? "building" : "unit",
        });
        if (killer != null && killer.Team != target.Team)
        {
            killer.Stats.Kills++;
            killer.Stats.KillValue += CombatSystem.KillValue(target);
        }
        if (target.Owner != null)
        {
            target.Owner.Stats.Losses++;
        }
        switch (target)
        {
            case Unit unit:
                OnUnitKilled(unit, killer);
                break;
            case Building building:
                Map.Vacate(building.Rect, building.Id);
                Heroes.AwardKillXp(building, killer);
                break;
        }
    }

    public void Notify(Player player, string text, NoticeTone tone, Vector2? at)
    {
        Events.Add(new NoticeEvent
        {
            Player = player.Index,
            Text = text,
            Tone = tone,
            HasPosition = at.HasValue,
            X = at?.X ?? 0,
            Y = at?.Y ?? 0,
        });
    }

    private void OnUnitKilled(Unit unit, Player killer)
    {
        if (unit.IsHero && unit.Owner != null)
        {
            Heroes.OnHeroSlain(unit, killer);
        }
        if (unit.Camp != null)
        {
            Creeps.OnCreepDied(unit, killer);
        }
        Heroes.AwardKillXp(unit, killer);
    }

    private void FlushTileChanges()
    {
        if (Map.PendingChanges.Count == 0)
        {
            return;
        }
        Events.Add(new TileEvent { Changes = Map.PendingChanges.Select(c => new[] { c.X, c.Y, (int)c.Tile }).ToList() });
        Map.PendingChanges.Clear();
    }

    private void PushUnitsOut(TileRect rect)
    {
        foreach (var unit in Entities.Units)
        {
            var tileX = (int)MathF.Floor(unit.Position.X);
            var tileY = (int)MathF.Floor(unit.Position.Y);
            if (rect.Contains(tileX, tileY) && Pathfinder.TryNearestWalkable(tileX, tileY, out var x, out var y))
            {
                unit.Position = new Vector2(x + 0.5f, y + 0.5f);
                unit.ClearPath();
            }
        }
    }

}
